import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { getDb } from "#/db/index.server";
import { apiKeys, providerInstances } from "#/db/schema";
import { recordAuditEvent } from "#/server/audit.server";
import { sha256 } from "#/server/config.server";
import { createApiKeySecret } from "#/server/crypto.server";
import { GatewayError } from "#/server/errors";

type JsonStringArray = readonly string[];

export type ApiKeyView = {
	readonly id: string;
	readonly label: string;
	readonly prefix: string;
	readonly providerSlugs: JsonStringArray;
	readonly instanceIds: JsonStringArray;
	readonly expiresAt: Date | null;
	readonly revokedAt: Date | null;
	readonly lastUsedAt: Date | null;
	readonly createdAt: Date;
};

export type CreatedApiKey = ApiKeyView & { readonly secret: string };

function asStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function toView(key: typeof apiKeys.$inferSelect): ApiKeyView {
	return {
		id: key.id,
		label: key.label,
		prefix: key.prefix,
		providerSlugs: asStringArray(key.providerSlugs),
		instanceIds: asStringArray(key.instanceIds),
		expiresAt: key.expiresAt,
		revokedAt: key.revokedAt,
		lastUsedAt: key.lastUsedAt,
		createdAt: key.createdAt,
	};
}

export async function listApiKeys(
	userId: string,
): Promise<readonly ApiKeyView[]> {
	const db = getDb();
	const keys = await db
		.select()
		.from(apiKeys)
		.where(eq(apiKeys.userId, userId))
		.orderBy(desc(apiKeys.createdAt));
	return keys.map(toView);
}

export async function createApiKey(
	userId: string,
	input: {
		readonly label: string;
		readonly providerSlugs: readonly string[];
		readonly instanceIds: readonly string[];
		readonly expiresAt?: Date;
	},
): Promise<CreatedApiKey> {
	const label = input.label.trim();
	if (!label || label.length > 120) {
		throw new GatewayError(
			400,
			"INVALID_API_KEY_LABEL",
			"API key labels must be between 1 and 120 characters.",
		);
	}
	const providerSlugs = [
		...new Set(
			input.providerSlugs
				.map((slug) => slug.trim().toLowerCase())
				.filter(Boolean),
		),
	];
	const instanceIds = [...new Set(input.instanceIds)];
	if (input.expiresAt && input.expiresAt <= new Date()) {
		throw new GatewayError(
			400,
			"INVALID_API_KEY_EXPIRY",
			"API key expiry must be in the future.",
		);
	}

	const db = getDb();
	if (instanceIds.length > 0) {
		const instances = await db
			.select({
				id: providerInstances.id,
				providerSlug: providerInstances.providerSlug,
			})
			.from(providerInstances)
			.where(
				and(
					eq(providerInstances.userId, userId),
					inArray(providerInstances.id, instanceIds),
				),
			);
		if (instances.length !== instanceIds.length) {
			throw new GatewayError(
				400,
				"INVALID_API_KEY_SCOPE",
				"API key instance restrictions must belong to your workspace.",
			);
		}
		if (
			providerSlugs.length > 0 &&
			instances.some(
				(instance) => !providerSlugs.includes(instance.providerSlug),
			)
		) {
			throw new GatewayError(
				400,
				"INVALID_API_KEY_SCOPE",
				"Each selected instance must belong to a selected provider pool.",
			);
		}
	}

	const id = uuidv7();
	const prefix = `agw_${id.slice(0, 8)}`;
	const secret = `${prefix}_${createApiKeySecret()}`;
	const now = new Date();
	const [created] = await db.transaction(async (tx) => {
		const result = await tx
			.insert(apiKeys)
			.values({
				id,
				userId,
				label,
				prefix,
				digest: sha256(secret),
				providerSlugs,
				instanceIds,
				expiresAt: input.expiresAt ?? null,
				createdAt: now,
				updatedAt: now,
			})
			.returning();
		return result;
	});
	if (!created) {
		throw new GatewayError(
			500,
			"API_KEY_CREATE_FAILED",
			"The API key could not be created.",
		);
	}
	recordAuditEvent({
		action: "api_key.created",
		metadata: {
			instanceCount: instanceIds.length,
			providerSlugs: providerSlugs.join(","),
		},
		resourceId: id,
		resourceType: "api_key",
		userId,
	});
	return { ...toView(created), secret };
}

export async function revokeApiKey(userId: string, id: string): Promise<void> {
	const db = getDb();
	const now = new Date();
	const [revoked] = await db
		.update(apiKeys)
		.set({ revokedAt: now, updatedAt: now })
		.where(
			and(
				eq(apiKeys.userId, userId),
				eq(apiKeys.id, id),
				isNull(apiKeys.revokedAt),
			),
		)
		.returning({ id: apiKeys.id });
	if (!revoked) {
		throw new GatewayError(
			404,
			"API_KEY_NOT_FOUND",
			"API key not found or already revoked.",
		);
	}
	recordAuditEvent({
		action: "api_key.revoked",
		resourceId: id,
		resourceType: "api_key",
		userId,
	});
}

export async function findActiveApiKey(rawKey: string) {
	const db = getDb();
	const [key] = await db
		.select()
		.from(apiKeys)
		.where(
			and(
				eq(apiKeys.digest, sha256(rawKey)),
				isNull(apiKeys.revokedAt),
				or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date())),
			),
		)
		.limit(1);
	return key;
}

export async function markApiKeyUsed(id: string): Promise<void> {
	await getDb()
		.update(apiKeys)
		.set({ lastUsedAt: new Date() })
		.where(eq(apiKeys.id, id));
}

export { asStringArray };
