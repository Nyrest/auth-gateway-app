import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	ilike,
	isNotNull,
	isNull,
	or,
	sql,
} from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { getDb } from "#/db/index.server";
import { apiKeys, providerInstances } from "#/db/schema";
import { recordAuditEvent } from "#/server/audit.server";
import { sha256 } from "#/server/config.server";
import { createApiKeySecret } from "#/server/crypto.server";
import { GatewayError } from "#/server/errors";

import {
	type ApiKeyListResult,
	type ApiKeyPermission,
	type ApiKeyProviderScopeMode,
	type ApiKeysQueryInput,
	type ApiKeyView,
	apiKeyPermissions,
	type CreatedApiKey,
} from "./api-keys.types";

export type {
	ApiKeyListResult,
	ApiKeyPermission,
	ApiKeyPolicy,
	ApiKeyProviderScopeMode,
	ApiKeysQueryInput,
	ApiKeyView,
	CreatedApiKey,
} from "./api-keys.types";
export { apiKeyPermissions } from "./api-keys.types";

function asStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function asPermissions(value: unknown): ApiKeyPermission[] {
	if (!Array.isArray(value)) return ["proxy"];
	const known = new Set<string>(apiKeyPermissions);
	return [
		...new Set(
			value.filter(
				(item): item is ApiKeyPermission =>
					typeof item === "string" && known.has(item),
			),
		),
	];
}

function normalizePermissions(
	value: readonly string[] | undefined,
): ApiKeyPermission[] {
	const known = new Set<string>(apiKeyPermissions);
	const permissions = [
		...new Set(
			(value ?? ["proxy"]).filter((item): item is ApiKeyPermission =>
				known.has(item),
			),
		),
	];
	if (permissions.length === 0) {
		throw new GatewayError(
			400,
			"INVALID_API_KEY_PERMISSIONS",
			"Select at least one API key permission.",
		);
	}
	for (const [write, read] of [
		["connections:write", "connections:read"],
		["api_keys:write", "api_keys:read"],
		["settings:write", "settings:read"],
	] as const) {
		if (permissions.includes(write) && !permissions.includes(read))
			permissions.push(read);
	}
	return permissions;
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
		permissions: asPermissions(key.permissions),
		providerScopeMode: normalizeScopeMode(key.providerScopeMode),
		providerSlugs: asStringArray(key.providerSlugs),
		instanceIds: asStringArray(key.instanceIds),
		expiresAt: key.expiresAt,
		revokedAt: key.revokedAt,
		lastUsedAt: key.lastUsedAt,
		createdAt: key.createdAt,
	};
}

function statusExpression() {
	return sql<string>`case when ${apiKeys.revokedAt} is not null then 'revoked' when ${apiKeys.expiresAt} is not null and ${apiKeys.expiresAt} <= now() then 'expired' else 'active' end`;
}

function normalizeListInput(input: ApiKeysQueryInput = {}) {
	const pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize ?? 8)));
	const page = Math.max(0, Math.trunc(input.page ?? 0));
	const search = input.search?.trim().slice(0, 120) ?? "";
	return {
		page,
		pageSize,
		search,
		permission: input.permission,
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
			ilike(apiKeys.label, pattern),
			ilike(apiKeys.prefix, pattern),
			sql`cast(${apiKeys.providerSlugs} as text) ilike ${pattern}`,
			sql`cast(${apiKeys.permissions} as text) ilike ${pattern}`,
		);
		if (searchFilter) filters.push(searchFilter);
	}
	if (normalized.permission) {
		filters.push(
			sql`${apiKeys.permissions} @> ${JSON.stringify([normalized.permission])}::jsonb`,
		);
	}
	if (normalized.status === "revoked")
		filters.push(isNotNull(apiKeys.revokedAt));
	if (normalized.status === "expired") {
		filters.push(
			isNull(apiKeys.revokedAt),
			isNotNull(apiKeys.expiresAt),
			sql`${apiKeys.expiresAt} <= now()`,
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
					? statusExpression()
					: apiKeys.prefix;
	const orderBy =
		normalized.sort === "expiresAt"
			? normalized.direction === "desc"
				? desc(sql`coalesce(${orderColumn}, 'infinity'::timestamptz)`)
				: asc(sql`coalesce(${orderColumn}, 'infinity'::timestamptz)`)
			: normalized.direction === "desc"
				? desc(orderColumn)
				: asc(orderColumn);
	const [{ total }] = await db
		.select({ total: count() })
		.from(apiKeys)
		.where(where);
	const keys = await db
		.select()
		.from(apiKeys)
		.where(where)
		.orderBy(orderBy, desc(apiKeys.createdAt))
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
		readonly permissions?: readonly string[];
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
	const permissions = normalizePermissions(input.permissions);
	const providerScopeMode = normalizeScopeMode(input.providerScopeMode);
	const normalizedScope = await validateApiKeyScope(
		userId,
		providerScopeMode,
		providerSlugs,
		instanceIds,
		permissions,
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
			permissions,
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
	recordAuditEvent({
		action: "api_key.created",
		metadata: {
			instanceCount: normalizedScope.instanceIds.length,
			providerSlugs: normalizedScope.providerSlugs.join(","),
		},
		resourceId: id,
		resourceType: "api_key",
		userId,
	});
	return { ...toView(created), secret };
}

export async function updateApiKey(
	userId: string,
	id: string,
	input: {
		readonly label: string;
		readonly permissions?: readonly string[];
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
	const permissions = normalizePermissions(input.permissions);
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
		permissions,
	);
	const [updated] = await getDb()
		.update(apiKeys)
		.set({
			label,
			permissions,
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
	recordAuditEvent({
		action: "api_key.updated",
		resourceId: id,
		resourceType: "api_key",
		userId,
	});
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
	recordAuditEvent({
		action: "api_key.deleted",
		resourceId: id,
		resourceType: "api_key",
		userId,
	});
}

async function validateApiKeyScope(
	userId: string,
	providerScopeMode: ApiKeyProviderScopeMode,
	providerSlugs: readonly string[],
	instanceIds: readonly string[],
	permissions: readonly ApiKeyPermission[],
): Promise<{ providerSlugs: string[]; instanceIds: string[] }> {
	const normalizedProviders =
		providerScopeMode === "all" ? [] : [...new Set(providerSlugs)];
	if (providerScopeMode === "all" && instanceIds.length === 0) {
		return { providerSlugs: [], instanceIds: [] };
	}
	if (
		providerScopeMode === "selected" &&
		permissions.includes("proxy") &&
		normalizedProviders.length === 0
	) {
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

export function hasApiKeyPermission(
	key: { readonly permissions?: unknown },
	permission: ApiKeyPermission,
): boolean {
	return asPermissions(key.permissions).includes(permission);
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
				eq(apiKeys.keyKind, "user"),
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
			permissions: ["proxy"],
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
