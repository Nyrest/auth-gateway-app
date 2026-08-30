import { and, eq } from "drizzle-orm";
import { getDb } from "#/db/index.server";
import { providerInstances } from "#/db/schema";
import { recordAuditEvent } from "#/server/audit.server";
import { GatewayError } from "#/server/errors";
import { injectConnectionCredentials } from "#/server/proxy.server";
import { validateUpstreamUrl } from "#/server/upstream-url.server";

import { readConnectionSecrets } from "./secrets.server";
import { getProviderTemplate } from "./templates";

function configString(config: unknown, key: string): string | undefined {
	if (!config || typeof config !== "object" || Array.isArray(config)) {
		return undefined;
	}
	const value = (config as Record<string, unknown>)[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
	const target = validateUpstreamUrl(
		configString(instance.config, "test_url") ?? instance.baseUrl,
		instance.allowPrivateNetwork,
	);
	const secrets = await readConnectionSecrets(userId, instanceId);
	if (
		getProviderTemplate(instance.templateSlug)?.connectable &&
		!secrets.get("access_token")
	) {
		throw new GatewayError(
			400,
			"CONNECTION_NOT_CONNECTED",
			"Connect this OAuth connection before verifying it.",
		);
	}
	const method =
		configString(instance.config, "test_method") === "POST" ? "POST" : "GET";
	const testBody = configString(instance.config, "test_body");
	const headers = new Headers({ accept: "application/json" });
	injectConnectionCredentials(
		headers,
		instance.templateSlug,
		target.pathname.replace(/^\//, ""),
		secrets,
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
		userId,
	});
	return { ok, statusCode: response?.status ?? 502 };
}
