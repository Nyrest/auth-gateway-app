import { and, eq } from "drizzle-orm";
import { getDb } from "#/db/index.server";
import { providerInstances } from "#/db/schema";
import { recordAuditEvent } from "#/server/audit.server";
import { GatewayError } from "#/server/errors";
import { injectConnectionCredentials } from "#/server/proxy.server";
import {
	appendUpstreamPath,
	validateConfiguredUpstreamUrl,
} from "#/server/upstream-url.server";

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
	let baseUrl: URL;
	try {
		baseUrl = await validateConfiguredUpstreamUrl(instance.baseUrl);
	} catch (error) {
		if (
			error instanceof GatewayError &&
			error.code === "PRIVATE_UPSTREAM_BLOCKED"
		) {
			recordAuditEvent({
				action: "connection.verification_failed",
				metadata: { code: error.code },
				resourceId: instanceId,
				resourceType: "connection",
				result: "degraded",
				userId,
			});
		}
		throw error;
	}
	const secrets = await readConnectionSecrets(userId, instanceId);
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
	try {
		target = await validateConfiguredUpstreamUrl(target.toString());
	} catch (error) {
		if (
			error instanceof GatewayError &&
			error.code === "PRIVATE_UPSTREAM_BLOCKED"
		) {
			recordAuditEvent({
				action: "connection.verification_failed",
				metadata: { code: error.code },
				resourceId: instanceId,
				resourceType: "connection",
				result: "degraded",
				userId,
			});
		}
		throw error;
	}
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
	let response: Response | undefined;
	try {
		response = await fetch(target, {
			body: method === "POST" ? testBody : undefined,
			headers,
			method,
			redirect: "manual",
		});
	} catch {
		// Persist the failed health state below, then return the same safe result shape.
	}
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
