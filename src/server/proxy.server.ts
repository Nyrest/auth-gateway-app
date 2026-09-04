import { and, eq, inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { getDb } from "#/db/index.server";
import { providerInstances, requestMetrics } from "#/db/schema";
import {
	asStringArray,
	findActiveApiKey,
	hasApiKeyPermission,
	markApiKeyUsed,
} from "#/features/api-keys/api-keys.server";
import { readConnectionSecrets } from "#/features/connections/secrets.server";

import { GatewayError } from "./errors";
import { evaluateExpression } from "./expression.server";
import { getRequestRuntime } from "./request-runtime.server";
import {
	appendUpstreamPath,
	validateConfiguredUpstreamUrl,
} from "./upstream-url.server";

const maximumProxyBodyBytes = 100 * 1024 * 1024;
const providerSlugPattern = /^[a-z0-9][a-z0-9_-]{0,62}$/;

const blockedRequestHeaders = new Set([
	"authorization",
	"connection",
	"content-length",
	"cookie",
	"forwarded",
	"host",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"via",
	"x-forwarded-for",
	"x-forwarded-host",
	"x-forwarded-port",
	"x-forwarded-proto",
	"x-forwarded-server",
	"x-real-ip",
	"x-client-ip",
	"true-client-ip",
	"cf-connecting-ip",
]);

const blockedResponseHeaders = new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"set-cookie",
	"set-cookie2",
	"clear-site-data",
]);

function parseBearerToken(request: Request): string {
	const authorization = request.headers.get("authorization");
	const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/);
	if (!match?.[1]) {
		throw new GatewayError(
			401,
			"INVALID_API_KEY",
			"A proxy API key is required.",
		);
	}
	return match[1];
}

function connectedHeaderNames(headers: Headers): Set<string> {
	const values = headers.get("connection")?.split(",") ?? [];
	return new Set(
		values.map((value) => value.trim().toLowerCase()).filter(Boolean),
	);
}

function copyRequestHeaders(headers: Headers): Headers {
	const connectionTokens = connectedHeaderNames(headers);
	const forwarded = new Headers();
	for (const [name, value] of headers) {
		const normalized = name.toLowerCase();
		if (
			!blockedRequestHeaders.has(normalized) &&
			!normalized.startsWith("x-forwarded-") &&
			!connectionTokens.has(normalized)
		) {
			forwarded.append(name, value);
		}
	}
	return forwarded;
}

function copyResponseHeaders(headers: Headers): Headers {
	const connectionTokens = connectedHeaderNames(headers);
	const forwarded = new Headers();
	for (const [name, value] of headers) {
		const normalized = name.toLowerCase();
		if (
			!blockedResponseHeaders.has(normalized) &&
			!connectionTokens.has(normalized)
		) {
			forwarded.append(name, value);
		}
	}
	return forwarded;
}

function randomIndex(length: number): number {
	const value = new Uint32Array(1);
	crypto.getRandomValues(value);
	return value[0] % length;
}

function basicAuthorization(username: string, password: string): string {
	return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function asHeaderEntries(
	value: string | undefined,
): readonly { key: string; value: string }[] {
	if (!value) {
		return [];
	}
	try {
		const parsed: unknown = JSON.parse(value);
		if (Array.isArray(parsed)) {
			return parsed.flatMap((entry) => {
				if (
					entry &&
					typeof entry === "object" &&
					"key" in entry &&
					"value" in entry &&
					typeof entry.key === "string" &&
					typeof entry.value === "string"
				) {
					return [{ key: entry.key, value: entry.value }];
				}
				return [];
			});
		}
	} catch {
		// Fall through to the human-friendly key: value format below.
	}
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.flatMap((line) => {
			const separator = line.indexOf(":");
			if (separator < 1) return [];
			return [
				{
					key: line.slice(0, separator).trim(),
					value: line.slice(separator + 1).trim(),
				},
			];
		});
}

function isSafeInjectedHeader(name: string, value: string): boolean {
	const normalized = name.toLowerCase();
	return (
		/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) &&
		!/[\r\n]/.test(value) &&
		!blockedRequestHeaders.has(normalized) &&
		!normalized.startsWith("x-forwarded-") &&
		value.length <= 8_192
	);
}

function limitedRequestBody(
	request: Request,
): ReadableStream<Uint8Array> | undefined {
	const contentLength = request.headers.get("content-length");
	if (contentLength) {
		const parsed = Number(contentLength);
		if (
			!Number.isSafeInteger(parsed) ||
			parsed < 0 ||
			parsed > maximumProxyBodyBytes
		) {
			throw new GatewayError(
				413,
				"PROXY_BODY_TOO_LARGE",
				"The proxy request body is too large.",
			);
		}
	}
	if (!request.body) return undefined;
	let total = 0;
	const reader = request.body.getReader();
	return new ReadableStream({
		async pull(controller) {
			const chunk = await reader.read();
			if (chunk.done) {
				controller.close();
				return;
			}
			total += chunk.value.byteLength;
			if (total > maximumProxyBodyBytes) {
				await reader.cancel();
				controller.error(
					new GatewayError(
						413,
						"PROXY_BODY_TOO_LARGE",
						"The proxy request body is too large.",
					),
				);
				return;
			}
			controller.enqueue(chunk.value);
		},
		cancel(reason) {
			return reader.cancel(reason);
		},
	});
}

function requiredSecret(secrets: Map<string, string>, key: string): string {
	const value = secrets.get(key);
	if (!value) {
		throw new GatewayError(
			503,
			"CONNECTION_INCOMPLETE",
			`The selected connection is missing ${key}.`,
		);
	}
	return evaluateExpression(value);
}

export function injectConnectionCredentials(
	headers: Headers,
	templateSlug: string,
	path: string,
	secrets: Map<string, string>,
	config?: Readonly<Record<string, unknown>>,
): void {
	if (templateSlug === "generic_basic") {
		headers.set(
			"authorization",
			basicAuthorization(
				requiredSecret(secrets, "username"),
				requiredSecret(secrets, "password"),
			),
		);
		return;
	}
	if (templateSlug === "generic_bearer") {
		headers.set("authorization", `Bearer ${requiredSecret(secrets, "token")}`);
		return;
	}
	if (templateSlug === "generic_headers") {
		for (const header of asHeaderEntries(secrets.get("headers"))) {
			const value = evaluateExpression(header.value);
			if (!isSafeInjectedHeader(header.key, value)) {
				throw new GatewayError(
					400,
					"INVALID_INJECTED_HEADER",
					"The connection has an unsafe injected header.",
				);
			}
			headers.set(header.key, value);
		}
		return;
	}
	if (
		templateSlug === "github_oauth" &&
		/^applications\/[^/]+(?:\/|$)/.test(path)
	) {
		const legacyClientId = secrets.get("client_id");
		const publicClientId =
			typeof config?.client_id === "string" ? config.client_id : legacyClientId;
		if (!publicClientId) {
			throw new GatewayError(
				503,
				"CONNECTION_INCOMPLETE",
				"The selected connection is missing client_id.",
			);
		}
		const pathClientId = path.split("/")[1];
		if (pathClientId !== publicClientId) {
			throw new GatewayError(
				400,
				"GITHUB_CLIENT_MISMATCH",
				"GitHub application path does not match the configured client ID.",
			);
		}
		headers.set(
			"authorization",
			basicAuthorization(
				publicClientId,
				requiredSecret(secrets, "client_secret"),
			),
		);
	} else if (secrets.get("access_token")) {
		headers.set(
			"authorization",
			`Bearer ${requiredSecret(secrets, "access_token")}`,
		);
	}
	if (templateSlug === "github_oauth") {
		headers.set("accept", "application/vnd.github+json");
		headers.set("x-github-api-version", "2022-11-28");
		headers.set("user-agent", "auth-gateway");
	}
}

async function recordMetric(input: {
	readonly apiKeyId: string;
	readonly instanceId: string;
	readonly latencyMs: number;
	readonly method: string;
	readonly path: string;
	readonly providerSlug: string;
	readonly sourceIp: string | null;
	readonly statusCode: number;
	readonly userId: string;
}): Promise<void> {
	await getDb().insert(requestMetrics).values({
		id: uuidv7(),
		userId: input.userId,
		instanceId: input.instanceId,
		apiKeyId: input.apiKeyId,
		providerSlug: input.providerSlug,
		method: input.method,
		path: input.path,
		statusCode: input.statusCode,
		latencyMs: input.latencyMs,
		sourceIp: input.sourceIp,
	});
}

export async function proxyRequest(
	request: Request,
	providerSlug: string,
	path: string,
): Promise<Response> {
	if (!providerSlugPattern.test(providerSlug) || path.length > 8_192) {
		throw new GatewayError(
			400,
			"INVALID_PROXY_PATH",
			"The proxy route is invalid.",
		);
	}
	const startedAt = performance.now();
	const key = await findActiveApiKey(parseBearerToken(request));
	if (!key) {
		throw new GatewayError(
			401,
			"INVALID_API_KEY",
			"The proxy API key is invalid, expired, or revoked.",
		);
	}
	if (!hasApiKeyPermission(key, "proxy")) {
		throw new GatewayError(
			403,
			"API_KEY_PERMISSION_DENIED",
			"This API key does not have proxy permission.",
		);
	}

	const instanceIds = asStringArray(key.instanceIds);
	const providerSlugs = asStringArray(key.providerSlugs);
	const providerScopeMode =
		key.providerScopeMode === "selected" ? "selected" : "all";
	if (
		(providerScopeMode === "selected" || providerSlugs.length > 0) &&
		!providerSlugs.includes(providerSlug)
	) {
		throw new GatewayError(
			403,
			"PROVIDER_NOT_ALLOWED",
			"This API key is not allowed to use this provider pool.",
		);
	}

	const candidates = await getDb()
		.select()
		.from(providerInstances)
		.where(
			and(
				eq(providerInstances.userId, key.userId),
				eq(providerInstances.providerSlug, providerSlug),
				eq(providerInstances.enabled, true),
				eq(providerInstances.status, "active"),
				eq(providerInstances.health, "healthy"),
				...(instanceIds.length > 0
					? [inArray(providerInstances.id, instanceIds)]
					: []),
			),
		);
	if (candidates.length === 0) {
		throw new GatewayError(
			503,
			"POOL_UNAVAILABLE",
			"No active connection is available for this provider pool.",
		);
	}
	const instance = candidates[randomIndex(candidates.length)];

	const outboundHeaders = copyRequestHeaders(request.headers);
	const secrets = await readConnectionSecrets(key.userId, instance.id);
	injectConnectionCredentials(
		outboundHeaders,
		instance.templateSlug,
		path,
		secrets,
		instance.config &&
			typeof instance.config === "object" &&
			!Array.isArray(instance.config)
			? (instance.config as Record<string, unknown>)
			: undefined,
	);
	const baseUrl = await validateConfiguredUpstreamUrl(instance.baseUrl);
	const target = appendUpstreamPath(baseUrl, path, new URL(request.url).search);
	const canHaveBody = request.method !== "GET" && request.method !== "HEAD";
	const body = canHaveBody ? limitedRequestBody(request) : undefined;
	let upstream: Response;
	try {
		upstream = await fetch(target, {
			body,
			credentials: "omit",
			headers: outboundHeaders,
			method: request.method,
			redirect: "manual",
		});
	} catch {
		getRequestRuntime().deferred.defer(() =>
			recordMetric({
				apiKeyId: key.id,
				instanceId: instance.id,
				latencyMs: Math.round(performance.now() - startedAt),
				method: request.method,
				path,
				providerSlug,
				sourceIp: getRequestRuntime().clientIp,
				statusCode: 502,
				userId: key.userId,
			}),
		);
		throw new GatewayError(
			502,
			"UPSTREAM_UNAVAILABLE",
			"The selected upstream could not be reached.",
		);
	}

	getRequestRuntime().deferred.defer(async () => {
		await Promise.all([
			markApiKeyUsed(key.id),
			recordMetric({
				apiKeyId: key.id,
				instanceId: instance.id,
				latencyMs: Math.round(performance.now() - startedAt),
				method: request.method,
				path,
				providerSlug,
				sourceIp: getRequestRuntime().clientIp,
				statusCode: upstream.status,
				userId: key.userId,
			}),
		]);
	});
	return new Response(upstream.body, {
		headers: copyResponseHeaders(upstream.headers),
		status: upstream.status,
		statusText: upstream.statusText,
	});
}
