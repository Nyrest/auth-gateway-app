import { and, eq } from "drizzle-orm";
import { getDb } from "#/db/index.server";
import { providerInstances } from "#/db/schema";
import { recordAuditEvent } from "#/server/audit.server";
import { applyCustomHeaders } from "#/server/custom-headers.server";
import { GatewayError } from "#/server/errors";
import { fetchUpstream } from "#/server/outbound-request.server";
import {
	applyProviderPolicy,
	injectConnectionCredentials,
} from "#/server/proxy.server";
import { appendUpstreamPath, parseHttpUrl } from "#/server/url.server";

import { readConnectionSecrets } from "./secrets.server";
import { getProviderTemplate } from "./templates";

function configString(config: unknown, key: string): string | undefined {
	if (!config || typeof config !== "object" || Array.isArray(config)) {
		return undefined;
	}
	const value = (config as Record<string, unknown>)[key];
	if (typeof value === "string" && value.trim()) return value.trim();
	if (key === "test_body" && value && typeof value === "object") {
		try {
			return JSON.stringify(value);
		} catch {
			return undefined;
		}
	}
	return undefined;
}

export async function verifyConnection(
	userId: string,
	instanceId: string,
	expectedHealthLeaseUntil?: Date,
): Promise<{ readonly ok: boolean; readonly statusCode: number }> {
	const db = getDb();
	const [instance] = await db
		.select()
		.from(providerInstances)
		.where(
			and(
				eq(providerInstances.id, instanceId),
				eq(providerInstances.userId, userId),
				...(expectedHealthLeaseUntil
					? [eq(providerInstances.healthLeaseUntil, expectedHealthLeaseUntil)]
					: []),
			),
		)
		.limit(1);
	if (!instance) {
		throw new GatewayError(
			404,
			"CONNECTION_NOT_FOUND",
			"Connection not found.",
		);
	}
	const template = getProviderTemplate(instance.templateSlug);
	const configuredTestUrl = configString(instance.config, "test_url");
	let baseUrl = parseHttpUrl(instance.baseUrl);
	const secrets = await readConnectionSecrets(userId, instanceId);
	if (template?.mcp) {
		const configuredMcpUrl = configString(instance.config, "mcp_server_url");
		if (configuredMcpUrl) baseUrl = parseHttpUrl(configuredMcpUrl);
	}
	if (template?.capabilities.connect && !secrets.get("access_token")) {
		throw new GatewayError(
			400,
			"CONNECTION_NOT_CONNECTED",
			"Connect this OAuth connection before verifying it.",
		);
	}

	let target: URL;
	let method: "GET" | "POST";
	let testBody: string | undefined;
	let credentialPath: string;
	try {
		if (template?.verification) {
			const verification = template.verification;
			const configured = verification.path;
			if (/^https?:\/\//i.test(configured)) {
				target = new URL(configured);
				credentialPath = "";
			} else {
				target = appendUpstreamPath(baseUrl, configured.replace(/^\//, ""), "");
				credentialPath = configured.replace(/^\//, "");
			}
			method = verification.method;
			testBody =
				verification.body === undefined
					? undefined
					: JSON.stringify(verification.body);
		} else
			switch (instance.templateSlug) {
				case "github_oauth": {
					// GitHub verifies OAuth credentials through the app-management
					// endpoint, which requires Basic auth and the access token in JSON.
					const clientId =
						configString(instance.config, "client_id") ??
						secrets.get("client_id");
					const accessToken = secrets.get("access_token");
					if (!clientId || !accessToken) {
						throw new GatewayError(
							400,
							"CONNECTION_NOT_CONNECTED",
							"Connect this OAuth connection before verifying it.",
						);
					}
					credentialPath = `applications/${clientId}/token`;
					target = appendUpstreamPath(baseUrl, credentialPath, "");
					method = "POST";
					testBody = JSON.stringify({ access_token: accessToken });
					break;
				}
				case "google_oauth":
					target = new URL("https://openidconnect.googleapis.com/v1/userinfo");
					method = "GET";
					credentialPath = "";
					break;
				case "microsoft_entra_oauth":
					target = new URL("https://graph.microsoft.com/oidc/userinfo");
					method = "GET";
					credentialPath = "";
					break;
				default:
					target = new URL(configuredTestUrl ?? baseUrl.toString(), baseUrl);
					method =
						configString(instance.config, "test_method") === "POST"
							? "POST"
							: "GET";
					testBody = configString(instance.config, "test_body");
					credentialPath = target.pathname.replace(/^\//, "");
					if (method === "GET" && testBody) {
						throw new GatewayError(
							400,
							"INVALID_TEST_BODY",
							"Test JSON body cannot be used with GET.",
						);
					}
			}
	} catch (error) {
		if (error instanceof GatewayError) throw error;
		throw new GatewayError(400, "INVALID_TEST_URL", "The test URL is invalid.");
	}
	target = parseHttpUrl(target.toString());
	const headers = new Headers({ accept: "application/json" });
	injectConnectionCredentials(
		headers,
		instance.templateSlug,
		credentialPath,
		secrets,
		instance.config &&
			typeof instance.config === "object" &&
			!Array.isArray(instance.config)
			? (instance.config as Record<string, unknown>)
			: undefined,
	);
	target = applyProviderPolicy(headers, target, instance.templateSlug, secrets);
	if (method === "POST" && testBody) {
		try {
			JSON.parse(testBody);
			headers.set("content-type", "application/json");
		} catch {
			throw new GatewayError(
				400,
				"INVALID_TEST_BODY",
				"Test JSON body must be valid JSON.",
			);
		}
	}
	applyCustomHeaders(headers, secrets);
	let response: Response | undefined;
	try {
		response = await fetchUpstream(target, {
			body: method === "POST" ? testBody : undefined,
			headers,
			method,
			redirect: "manual",
			timeoutMs: template?.mcp ? 10_000 : 30_000,
		});
	} catch {
		// Persist the failed health state below, then return the same safe result shape.
	}
	if (template?.mcp && response?.body) await response.body.cancel();
	const ok = Boolean(
		response && response.status >= 200 && response.status < 400,
	);
	const now = new Date();
	const interval = instance.healthIntervalMinutes ?? 60;
	await db.transaction(async (tx) => {
		const [updated] = await tx
			.update(providerInstances)
			.set({
				health: ok ? "healthy" : "unhealthy",
				healthDueAt: new Date(now.getTime() + interval * 60_000),
				healthFailureCount: ok ? 0 : instance.healthFailureCount + 1,
				status: ok
					? "active"
					: instance.status === "connecting"
						? "invalid"
						: instance.status,
				updatedAt: now,
			})
			.where(
				and(
					eq(providerInstances.id, instanceId),
					eq(providerInstances.userId, userId),
					...(expectedHealthLeaseUntil
						? [eq(providerInstances.healthLeaseUntil, expectedHealthLeaseUntil)]
						: []),
				),
			)
			.returning({ id: providerInstances.id });
		if (!updated) return;
	});
	recordAuditEvent({
		action: ok ? "connection.verified" : "connection.verification_failed",
		metadata: { statusCode: response?.status ?? null },
		resourceId: instanceId,
		resourceType: "connection",
		result: ok ? "success" : "failure",
		userId,
	});
	return { ok, statusCode: response?.status ?? 502 };
}
