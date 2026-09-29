import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	isNotNull,
	isNull,
	lte,
	or,
	sql,
} from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { getDb } from "#/db/index.server";
import { apiKeys, providerInstances } from "#/db/schema";
import { caseInsensitiveLike } from "#/db/sql.server";
import { sha256 } from "#/server/config.server";
import { createApiKeySecret } from "#/server/crypto.server";
import { GatewayError } from "#/server/errors";

import type {
	ApiKeyListResult,
	ApiKeyProviderScopeMode,
	ApiKeysQueryInput,
	ApiKeyView,
	CreatedApiKey,
} from "./api-keys.types";

export type {
	ApiKeyListResult,
	ApiKeyPolicy,
	ApiKeyProviderScopeMode,
	ApiKeysQueryInput,
	ApiKeyView,
	CreatedApiKey,
} from "./api-keys.types";

function asStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function normalizeScopeMode(
	value: string | undefined,
): ApiKeyProviderScopeMode {
	return value === "selected" ? "selected" : "all";
}

function toView(key: typeof apiKeys.$inferSelect): ApiKeyView {
	return {
		id: key.id,
		label: key.label,
		prefix: key.prefix,
		providerScopeMode: normalizeScopeMode(key.providerScopeMode),
		providerSlugs: asStringArray(key.providerSlugs),
		instanceIds: asStringArray(key.instanceIds),
		expiresAt: key.expiresAt,
		revokedAt: key.revokedAt,
		createdAt: key.createdAt,
	};
}

function statusExpression(now: Date) {
	const encodedNow = apiKeys.expiresAt.mapToDriverValue(now);
	return sql<string>`case when ${apiKeys.revokedAt} is not null then 'revoked' when ${apiKeys.expiresAt} is not null and ${apiKeys.expiresAt} <= ${encodedNow} then 'expired' else 'active' end`;
}

function normalizeListInput(input: ApiKeysQueryInput = {}) {
	const pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize ?? 8)));
	const page = Math.max(0, Math.trunc(input.page ?? 0));
	const search = input.search?.trim().slice(0, 120) ?? "";
	return {
		page,
		pageSize,
		search,
		sort: input.sort ?? "prefix",
		direction: input.direction === "desc" ? "desc" : "asc",
		status: input.status ?? "all",
	} as const;
}

export async function listApiKeys(
	userId: string,
	input: ApiKeysQueryInput = {},
): Promise<ApiKeyListResult> {
	const db = getDb();
	const normalized = normalizeListInput(input);
	const filters = [eq(apiKeys.userId, userId), eq(apiKeys.keyKind, "user")];
	if (normalized.search) {
		const pattern = `%${normalized.search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
		const searchFilter = or(
			caseInsensitiveLike(apiKeys.label, pattern),
			caseInsensitiveLike(apiKeys.prefix, pattern),
			caseInsensitiveLike(apiKeys.providerSlugs, pattern),
		);
		if (searchFilter) filters.push(searchFilter);
	}
	if (normalized.status === "revoked")
		filters.push(isNotNull(apiKeys.revokedAt));
	if (normalized.status === "expired") {
		filters.push(
			isNull(apiKeys.revokedAt),
			isNotNull(apiKeys.expiresAt),
			lte(apiKeys.expiresAt, new Date()),
		);
	}
	if (normalized.status === "active") {
		const activeExpiry = or(
			isNull(apiKeys.expiresAt),
			gt(apiKeys.expiresAt, new Date()),
		);
		filters.push(isNull(apiKeys.revokedAt));
		if (activeExpiry) filters.push(activeExpiry);
	}
	const where = and(...filters);
	const orderColumn =
		normalized.sort === "label"
			? apiKeys.label
			: normalized.sort === "expiresAt"
				? apiKeys.expiresAt
				: normalized.sort === "status"
					? statusExpression(new Date())
					: apiKeys.prefix;
	const orderBy =
		normalized.sort === "expiresAt"
			? [
					normalized.direction === "desc"
						? desc(
								sql`case when ${apiKeys.expiresAt} is null then 1 else 0 end`,
							)
						: asc(
								sql`case when ${apiKeys.expiresAt} is null then 1 else 0 end`,
							),
					normalized.direction === "desc"
						? desc(apiKeys.expiresAt)
						: asc(apiKeys.expiresAt),
				]
			: [
					normalized.direction === "desc"
						? desc(orderColumn)
						: asc(orderColumn),
				];
	const [{ total }] = await db
		.select({ total: count() })
		.from(apiKeys)
		.where(where);
	const keys = await db
		.select()
		.from(apiKeys)
		.where(where)
		.orderBy(...orderBy, desc(apiKeys.createdAt))
		.limit(normalized.pageSize)
		.offset(normalized.page * normalized.pageSize);
	const totalCount = Number(total ?? 0);
	return {
		items: keys.map(toView),
		total: totalCount,
		page: normalized.page,
		pageSize: normalized.pageSize,
		pageCount: Math.max(1, Math.ceil(totalCount / normalized.pageSize)),
	};
}

export async function createApiKey(
	userId: string,
	input: {
		readonly label: string;
		readonly providerScopeMode?: ApiKeyProviderScopeMode;
		readonly providerSlugs: readonly string[];
		readonly instanceIds: readonly string[];
		readonly expiresAt?: Date | null;
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
	const providerScopeMode = normalizeScopeMode(input.providerScopeMode);
	const normalizedScope = await validateApiKeyScope(
		userId,
		providerScopeMode,
		providerSlugs,
		instanceIds,
	);
	if (input.expiresAt && input.expiresAt <= new Date()) {
		throw new GatewayError(
			400,
			"INVALID_API_KEY_EXPIRY",
			"API key expiry must be in the future.",
		);
	}

	const db = getDb();

	const id = uuidv7();
	const prefix = `agw_${id.slice(0, 8)}`;
	const secret = `${prefix}_${createApiKeySecret()}`;
	const now = new Date();
	const [created] = await db
		.insert(apiKeys)
		.values({
			id,
			userId,
			label,
			prefix,
			digest: sha256(secret),
			providerSlugs: normalizedScope.providerSlugs,
			instanceIds: normalizedScope.instanceIds,
			providerScopeMode,
			expiresAt: input.expiresAt ?? null,
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	if (!created) {
		throw new GatewayError(
			500,
			"API_KEY_CREATE_FAILED",
			"The API key could not be created.",
		);
	}
	return { ...toView(created), secret };
}

export async function updateApiKey(
	userId: string,
	id: string,
	input: {
		readonly label: string;
		readonly providerScopeMode?: ApiKeyProviderScopeMode;
		readonly providerSlugs: readonly string[];
		readonly instanceIds: readonly string[];
		readonly expiresAt?: Date | null;
	},
): Promise<ApiKeyView> {
	const label = input.label.trim();
	if (!label || label.length > 120) {
		throw new GatewayError(
			400,
			"INVALID_API_KEY_LABEL",
			"API key labels must be between 1 and 120 characters.",
		);
	}
	if (input.expiresAt && input.expiresAt <= new Date()) {
		throw new GatewayError(
			400,
			"INVALID_API_KEY_EXPIRY",
			"API key expiry must be in the future.",
		);
	}
	const providerScopeMode = normalizeScopeMode(input.providerScopeMode);
	const providerSlugs = [
		...new Set(
			input.providerSlugs
				.map((slug) => slug.trim().toLowerCase())
				.filter(Boolean),
		),
	];
	const instanceIds = [...new Set(input.instanceIds)];
	const normalizedScope = await validateApiKeyScope(
		userId,
		providerScopeMode,
		providerSlugs,
		instanceIds,
	);
	const [updated] = await getDb()
		.update(apiKeys)
		.set({
			label,
			providerScopeMode,
			providerSlugs: normalizedScope.providerSlugs,
			instanceIds: normalizedScope.instanceIds,
			expiresAt: input.expiresAt ?? null,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(apiKeys.userId, userId),
				eq(apiKeys.id, id),
				eq(apiKeys.keyKind, "user"),
				isNull(apiKeys.revokedAt),
			),
		)
		.returning();
	if (!updated)
		throw new GatewayError(
			404,
			"API_KEY_NOT_FOUND",
			"API key not found or revoked.",
		);
	return toView(updated);
}

export async function deleteApiKey(userId: string, id: string): Promise<void> {
	const [deleted] = await getDb()
		.delete(apiKeys)
		.where(
			and(
				eq(apiKeys.userId, userId),
				eq(apiKeys.id, id),
				eq(apiKeys.keyKind, "user"),
			),
		)
		.returning({ id: apiKeys.id });
	if (!deleted)
		throw new GatewayError(404, "API_KEY_NOT_FOUND", "API key not found.");
}

async function validateApiKeyScope(
	userId: string,
	providerScopeMode: ApiKeyProviderScopeMode,
	providerSlugs: readonly string[],
	instanceIds: readonly string[],
): Promise<{ providerSlugs: string[]; instanceIds: string[] }> {
	const normalizedProviders =
		providerScopeMode === "all" ? [] : [...new Set(providerSlugs)];
	if (providerScopeMode === "all" && instanceIds.length === 0) {
		return { providerSlugs: [], instanceIds: [] };
	}
	if (providerScopeMode === "selected" && normalizedProviders.length === 0) {
		throw new GatewayError(
			400,
			"INVALID_API_KEY_SCOPE",
			"Select at least one provider for a proxy key.",
		);
	}
	const instances = await getDb()
		.select({
			id: providerInstances.id,
			providerSlug: providerInstances.providerSlug,
		})
		.from(providerInstances)
		.where(eq(providerInstances.userId, userId));
	const availableProviders = new Set(
		instances.map((instance) => instance.providerSlug),
	);
	if (
		providerScopeMode === "selected" &&
		normalizedProviders.some((slug) => !availableProviders.has(slug))
	) {
		throw new GatewayError(
			400,
			"INVALID_API_KEY_SCOPE",
			"Each selected provider pool must belong to your workspace.",
		);
	}
	const selectedInstances = instances.filter((instance) =>
		instanceIds.includes(instance.id),
	);
	if (selectedInstances.length !== instanceIds.length) {
		throw new GatewayError(
			400,
			"INVALID_API_KEY_SCOPE",
			"API key instance restrictions must belong to your workspace.",
		);
	}
	if (
		normalizedProviders.length > 0 &&
		selectedInstances.some(
			(instance) => !normalizedProviders.includes(instance.providerSlug),
		)
	) {
		throw new GatewayError(
			400,
			"INVALID_API_KEY_SCOPE",
			"Each selected instance must belong to a selected provider pool.",
		);
	}
	return {
		providerSlugs: normalizedProviders,
		instanceIds: [...new Set(instanceIds)],
	};
}

export async function listApiKeyScopeOptions(userId: string) {
	const rows = await getDb()
		.select({
			id: providerInstances.id,
			providerSlug: providerInstances.providerSlug,
			name: providerInstances.name,
		})
		.from(providerInstances)
		.where(eq(providerInstances.userId, userId))
		.orderBy(providerInstances.providerSlug, providerInstances.name);
	return {
		providers: [...new Set(rows.map((row) => row.providerSlug))],
		instances: rows,
	};
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
				eq(apiKeys.keyKind, "user"),
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
}

export async function findActiveApiKey(rawKey: string) {
	const db = getDb();
	const [key] = await db
		.select()
		.from(apiKeys)
		.where(
			and(
				eq(apiKeys.digest, sha256(rawKey)),
				eq(apiKeys.keyKind, "user"),
				isNull(apiKeys.revokedAt),
				or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date())),
			),
		)
		.limit(1);
	return key;
}

export async function getOrCreatePlaygroundApiKey(userId: string) {
	const db = getDb();
	const existing = await db
		.select()
		.from(apiKeys)
		.where(and(eq(apiKeys.userId, userId), eq(apiKeys.keyKind, "playground")))
		.limit(1);
	if (existing[0]) return existing[0];

	const id = uuidv7();
	const now = new Date();
	await db
		.insert(apiKeys)
		.values({
			id,
			userId,
			label: "Playground",
			prefix: `agw_playground_${id.slice(0, 8)}`,
			digest: sha256(createApiKeySecret()),
			keyKind: "playground",
			providerScopeMode: "all",
			providerSlugs: [],
			instanceIds: [],
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();
	const [created] = await db
		.select()
		.from(apiKeys)
		.where(and(eq(apiKeys.userId, userId), eq(apiKeys.keyKind, "playground")))
		.limit(1);
	if (!created)
		throw new GatewayError(
			500,
			"PLAYGROUND_API_KEY_CREATE_FAILED",
			"The Playground API key could not be created.",
		);
	return created;
}

export { asStringArray };
