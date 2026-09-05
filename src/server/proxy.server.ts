import { and, eq, inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { getDb } from "#/db/index.server";
import { type apiKeys, providerInstances, requestMetrics } from "#/db/schema";
import {
	asStringArray,
	findActiveApiKey,
	getOrCreatePlaygroundApiKey,
	markApiKeyUsed,
} from "#/features/api-keys/api-keys.server";
import { getProviderDefinition } from "#/features/connections/providers/registry";
import { readConnectionSecrets } from "#/features/connections/secrets.server";
import { applyCustomHeaders } from "./custom-headers.server";
import { GatewayError } from "./errors";
import { evaluateExpression } from "./expression.server";
import { fetchConfiguredUpstream } from "./outbound-request.server";
import { getRequestRuntime } from "./request-runtime.server";
import {
	appendUpstreamPath,
	validateConfiguredUpstreamUrl,
} from "./upstream-url.server";

export { applyCustomHeaders } from "./custom-headers.server";

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
	"x-auth-gateway-playground",
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

async function applyJsonApiKeyBody(
	body: ReadableStream<Uint8Array> | undefined,
	templateSlug: string,
	secrets: ReadonlyMap<string, string>,
): Promise<ReadableStream<Uint8Array> | undefined> {
	const auth = getProviderDefinition(templateSlug)?.auth;
	if (auth?.kind !== "json_api_key") return body;
	if (!body) {
		const value = secrets.get(auth.field);
		if (!value)
			throw new GatewayError(
				503,
				"CONNECTION_INCOMPLETE",
				"The selected connection is missing its API key.",
			);
		const encoded = new TextEncoder().encode(
			JSON.stringify({ [auth.name]: evaluateExpression(value) }),
		);
		return new ReadableStream({
			start(controller) {
				controller.enqueue(encoded);
				controller.close();
			},
		});
	}
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const part = await reader.read();
		if (part.done) break;
		total += part.value.byteLength;
		if (total > 256 * 1024)
			throw new GatewayError(
				413,
				"PROXY_BODY_TOO_LARGE",
				"The proxy request body is too large.",
			);
		chunks.push(part.value);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new GatewayError(
			400,
			"INVALID_JSON_BODY",
			"The request body must be valid JSON for this provider.",
		);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
		throw new GatewayError(
			400,
			"INVALID_JSON_BODY",
			"The request body must be a JSON object for this provider.",
		);
	const value = secrets.get(auth.field);
	if (!value)
		throw new GatewayError(
			503,
			"CONNECTION_INCOMPLETE",
			"The selected connection is missing its API key.",
		);
	(parsed as Record<string, unknown>)[auth.name] = evaluateExpression(value);
	const encoded = new TextEncoder().encode(JSON.stringify(parsed));
	return new ReadableStream({
		start(controller) {
			controller.enqueue(encoded);
			controller.close();
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
	const provider = getProviderDefinition(templateSlug);
	const auth = provider?.auth;
	if (auth) {
		if (auth.kind === "basic") {
			headers.set(
				"authorization",
				basicAuthorization(
					requiredSecret(secrets, auth.usernameField ?? "username"),
					requiredSecret(secrets, auth.passwordField ?? "password"),
				),
			);
			return;
		}
		if (auth.kind === "bearer" || auth.kind === "oauth_bearer") {
			const token = requiredSecret(
				secrets,
				auth.kind === "bearer" ? (auth.tokenField ?? "token") : "access_token",
			);
			headers.set("authorization", `Bearer ${token}`);
			return;
		}
		if (auth.kind === "api_key") {
			const value = requiredSecret(secrets, auth.field);
			const name = auth.name ?? "x-api-key";
			if (auth.location === "header")
				headers.set(name, auth.prefix ? `${auth.prefix} ${value}` : value);
			return;
		}
	}
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
	if (
		templateSlug === "github_oauth" &&
		/^applications\/[^/]+(?:\/|$)/.test(path)
	) {
		const publicClientId =
			typeof config?.client_id === "string" ? config.client_id : undefined;
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

export function applyProviderPolicy(
	headers: Headers,
	url: URL,
	templateSlug: string,
	secrets: ReadonlyMap<string, string>,
): URL {
	const provider = getProviderDefinition(templateSlug);
	if (!provider) return url;
	for (const [name, value] of Object.entries(provider.fixedHeaders ?? {}))
		headers.set(name, value);
	for (const [name, value] of Object.entries(provider.fixedQuery ?? {}))
		url.searchParams.set(name, value);
	const auth = provider.auth;
	if (auth?.kind === "api_key" && auth.location === "query") {
		const key = secrets.get(auth.field);
		if (key) url.searchParams.set(auth.name ?? "key", evaluateExpression(key));
	}
	if (auth?.kind === "api_key" && auth.location === "path") {
		const value = secrets.get(auth.field);
		if (value)
			url.pathname = url.pathname.replace(
				`{${auth.field}}`,
				encodeURIComponent(evaluateExpression(value)),
			);
	}
	return url;
}

function rewriteSseEndpoint(
	body: ReadableStream<Uint8Array> | null,
	gatewayUrl: string,
): ReadableStream<Uint8Array> | null {
	if (!body) return body;
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let carry = "";
	let endpointEvent = false;
	return body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				carry += decoder.decode(chunk, { stream: true });
				const lines = carry.split(/\n/);
				carry = lines.pop() ?? "";
				for (const line of lines) {
					if (line.trim().toLowerCase() === "event: endpoint") {
						endpointEvent = true;
					}
					const rewritten =
						endpointEvent && /^data:\s*/i.test(line)
							? `data: ${gatewayUrl}`
							: line.replace(
									/^(data:\s*)?endpoint:\s*https?:\/\/[^\s]+/i,
									`$1endpoint: ${gatewayUrl}`,
								);
					controller.enqueue(encoder.encode(`${rewritten}\n`));
					if (line === "") endpointEvent = false;
				}
			},
			flush(controller) {
				if (carry)
					controller.enqueue(
						encoder.encode(
							carry.replace(
								/endpoint:\s*https?:\/\/[^\s]+/i,
								`endpoint: ${gatewayUrl}`,
							),
						),
					);
			},
		}),
	);
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

type ProxyApiKey = typeof apiKeys.$inferSelect;

function assertProxyPath(path: string): void {
	if (path.length > 8_192) {
		throw new GatewayError(
			400,
			"INVALID_PROXY_PATH",
			"The proxy route is invalid.",
		);
	}
}

async function proxyWithInstance(
	request: Request,
	key: ProxyApiKey,
	instance: typeof providerInstances.$inferSelect,
	path: string,
): Promise<Response> {
	const startedAt = performance.now();
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
	const config =
		instance.config &&
		typeof instance.config === "object" &&
		!Array.isArray(instance.config)
			? (instance.config as Record<string, unknown>)
			: undefined;
	const provider = getProviderDefinition(instance.templateSlug);
	const configuredTransport = provider?.mcp
		? config?.transport === "sse"
			? "sse"
			: "streamable_http"
		: undefined;
	const configuredSession =
		configuredTransport === "sse"
			? "stateful"
			: config?.session_mode === "stateful"
				? "stateful"
				: provider?.mcp?.sessionMode;
	const mcpUrl = provider?.mcp
		? typeof config?.mcp_server_url === "string"
			? config.mcp_server_url
			: instance.baseUrl
		: instance.baseUrl;
	const target = applyProviderPolicy(
		outboundHeaders,
		appendUpstreamPath(
			await validateConfiguredUpstreamUrl(mcpUrl),
			path,
			new URL(request.url).search,
		),
		instance.templateSlug,
		secrets,
	);
	applyCustomHeaders(outboundHeaders, secrets);
	const canHaveBody = request.method !== "GET" && request.method !== "HEAD";
	let body = canHaveBody ? limitedRequestBody(request) : undefined;
	body = await applyJsonApiKeyBody(body, instance.templateSlug, secrets);
	if (
		configuredSession === "stateless" &&
		request.headers.has("mcp-session-id")
	) {
		throw new GatewayError(
			400,
			"MCP_SESSION_NOT_ALLOWED",
			"Stateless MCP requests must not include Mcp-Session-Id.",
		);
	}
	let upstream: Response;
	try {
		upstream = await fetchConfiguredUpstream(target, {
			body,
			headers: outboundHeaders,
			method: request.method,
			redirect: "manual",
			timeoutMs: 15_000,
		});
	} catch {
		getRequestRuntime().deferred.defer(() =>
			recordMetric({
				apiKeyId: key.id,
				instanceId: instance.id,
				latencyMs: Math.round(performance.now() - startedAt),
				method: request.method,
				path,
				providerSlug: instance.providerSlug,
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
				providerSlug: instance.providerSlug,
				sourceIp: getRequestRuntime().clientIp,
				statusCode: upstream.status,
				userId: key.userId,
			}),
		]);
	});
	const responseHeaders = copyResponseHeaders(upstream.headers);
	const responseBody =
		configuredTransport === "sse"
			? rewriteSseEndpoint(upstream.body, new URL(request.url).toString())
			: upstream.body;
	return new Response(responseBody, {
		headers: responseHeaders,
		status: upstream.status,
		statusText: upstream.statusText,
	});
}

export async function proxyRequest(
	request: Request,
	providerSlug: string,
	path: string,
): Promise<Response> {
	if (!providerSlugPattern.test(providerSlug)) {
		throw new GatewayError(
			400,
			"INVALID_PROXY_PATH",
			"The proxy route is invalid.",
		);
	}
	assertProxyPath(path);
	const key = await findActiveApiKey(parseBearerToken(request));
	if (!key) {
		throw new GatewayError(
			401,
			"INVALID_API_KEY",
			"The proxy API key is invalid, expired, or revoked.",
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
	return proxyWithInstance(
		request,
		key,
		candidates[randomIndex(candidates.length)],
		path,
	);
}

export async function proxyPlaygroundRequest(
	request: Request,
	userId: string,
	connectionId: string,
	path: string,
): Promise<Response> {
	assertProxyPath(path);
	const key = await getOrCreatePlaygroundApiKey(userId);
	const [instance] = await getDb()
		.select()
		.from(providerInstances)
		.where(
			and(
				eq(providerInstances.id, connectionId),
				eq(providerInstances.userId, userId),
				eq(providerInstances.enabled, true),
				eq(providerInstances.status, "active"),
				eq(providerInstances.health, "healthy"),
			),
		)
		.limit(1);
	if (!instance) {
		throw new GatewayError(
			503,
			"CONNECTION_UNAVAILABLE",
			"The selected connection is not available for proxying.",
		);
	}
	return proxyWithInstance(request, key, instance, path);
}
