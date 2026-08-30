import { and, desc, eq, inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { getDb } from "#/db/index.server";
import { providerInstances, providerSecrets } from "#/db/schema";
import { recordAuditEvent } from "#/server/audit.server";
import { createAssociatedData, encryptSecret } from "#/server/crypto.server";
import { GatewayError } from "#/server/errors";
import { validateUpstreamUrl } from "#/server/upstream-url.server";

import { getProviderTemplate, type ProviderTemplate } from "./templates";

export type JsonValue =
	| boolean
	| null
	| number
	| string
	| JsonObject
	| JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

export type ConnectionView = {
	readonly id: string;
	readonly name: string;
	readonly providerSlug: string;
	readonly instanceSlug: string;
	readonly templateSlug: string;
	readonly baseUrl: string;
	readonly config: JsonObject;
	readonly status: "draft" | "connecting" | "active" | "invalid";
	readonly health: "unknown" | "healthy" | "unhealthy";
	readonly enabled: boolean;
	readonly allowPrivateNetwork: boolean;
	readonly healthIntervalMinutes: number | null;
	readonly accessTokenExpiresAt: Date | null;
	readonly refreshDueAt: Date | null;
	readonly healthDueAt: Date | null;
	readonly secretKeys: readonly string[];
	readonly createdAt: Date;
	readonly updatedAt: Date;
};

export type CreateConnectionData = {
	readonly templateSlug: string;
	readonly name: string;
	readonly providerSlug: string;
	readonly baseUrl: string;
	readonly config: JsonObject;
	readonly secrets: Record<string, string>;
	readonly allowPrivateNetwork: boolean;
	readonly healthIntervalMinutes?: number;
};

function slugify(value: string): string {
	const normalized = value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 44);
	return normalized || "connection";
}

function assertProviderSlug(value: string): string {
	const slug = value.trim().toLowerCase();
	if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
		throw new GatewayError(
			400,
			"INVALID_PROVIDER_SLUG",
			"Provider slugs use lowercase letters, numbers, and hyphens.",
		);
	}
	return slug;
}

function assertTemplate(value: string): ProviderTemplate {
	const template = getProviderTemplate(value);
	if (!template) {
		throw new GatewayError(
			400,
			"UNKNOWN_PROVIDER_TEMPLATE",
			"Choose a supported provider template.",
		);
	}
	return template;
}

function isJsonValue(value: unknown): value is JsonValue {
	if (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "number" ||
		typeof value === "string"
	) {
		return true;
	}
	if (Array.isArray(value)) {
		return value.every((item) => isJsonValue(item));
	}
	if (!value || typeof value !== "object") {
		return false;
	}
	return Object.values(value).every((item) => isJsonValue(item));
}

export function asJsonObject(value: unknown): JsonObject {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	const config: Record<string, JsonValue> = {};
	for (const [key, item] of Object.entries(value)) {
		if (isJsonValue(item)) {
			config[key] = item;
		}
	}
	return config;
}

function assertFields(
	template: ProviderTemplate,
	data: CreateConnectionData,
): JsonObject {
	const allowedKeys = new Set(template.fields.map((field) => field.key));
	const config: Record<string, JsonValue> = {};

	for (const field of template.fields) {
		if (field.key === "base_url") {
			continue;
		}
		const value = field.secret
			? data.secrets[field.key]
			: data.config[field.key];
		if (
			field.required &&
			(value === undefined || value === "" || value === null)
		) {
			throw new GatewayError(
				400,
				"MISSING_PROVIDER_FIELD",
				`${field.label} is required.`,
			);
		}
		if (!field.secret && value !== undefined) {
			config[field.key] = value;
		}
	}

	for (const key of Object.keys(data.config)) {
		if (!allowedKeys.has(key)) {
			throw new GatewayError(
				400,
				"UNKNOWN_PROVIDER_FIELD",
				`Unsupported provider field: ${key}`,
			);
		}
	}
	for (const key of Object.keys(data.secrets)) {
		if (!allowedKeys.has(key)) {
			throw new GatewayError(
				400,
				"UNKNOWN_PROVIDER_FIELD",
				`Unsupported provider field: ${key}`,
			);
		}
	}

	return config;
}

function toView(
	instance: typeof providerInstances.$inferSelect,
	secretKeys: readonly string[],
): ConnectionView {
	return {
		id: instance.id,
		name: instance.name,
		providerSlug: instance.providerSlug,
		instanceSlug: instance.instanceSlug,
		templateSlug: instance.templateSlug,
		baseUrl: instance.baseUrl,
		config: asJsonObject(instance.config),
		status: instance.status,
		health: instance.health,
		enabled: instance.enabled,
		allowPrivateNetwork: instance.allowPrivateNetwork,
		healthIntervalMinutes: instance.healthIntervalMinutes,
		accessTokenExpiresAt: instance.accessTokenExpiresAt,
		refreshDueAt: instance.refreshDueAt,
		healthDueAt: instance.healthDueAt,
		secretKeys,
		createdAt: instance.createdAt,
		updatedAt: instance.updatedAt,
	};
}

export async function listConnections(
	userId: string,
): Promise<readonly ConnectionView[]> {
	const db = getDb();
	const instances = await db
		.select()
		.from(providerInstances)
		.where(eq(providerInstances.userId, userId))
		.orderBy(desc(providerInstances.updatedAt));
	if (instances.length === 0) {
		return [];
	}

	const secrets = await db
		.select({
			fieldKey: providerSecrets.fieldKey,
			instanceId: providerSecrets.instanceId,
		})
		.from(providerSecrets)
		.where(
			and(
				eq(providerSecrets.userId, userId),
				inArray(
					providerSecrets.instanceId,
					instances.map((item) => item.id),
				),
			),
		);
	const keysByInstance = new Map<string, string[]>();
	for (const secret of secrets) {
		const keys = keysByInstance.get(secret.instanceId) ?? [];
		keys.push(secret.fieldKey);
		keysByInstance.set(secret.instanceId, keys);
	}

	return instances.map((instance) =>
		toView(instance, keysByInstance.get(instance.id) ?? []),
	);
}

export async function getConnection(
	userId: string,
	id: string,
): Promise<ConnectionView> {
	const db = getDb();
	const [instance] = await db
		.select()
		.from(providerInstances)
		.where(
			and(eq(providerInstances.userId, userId), eq(providerInstances.id, id)),
		)
		.limit(1);
	if (!instance) {
		throw new GatewayError(
			404,
			"CONNECTION_NOT_FOUND",
			"Connection not found.",
		);
	}
	const secrets = await db
		.select({ fieldKey: providerSecrets.fieldKey })
		.from(providerSecrets)
		.where(
			and(
				eq(providerSecrets.userId, userId),
				eq(providerSecrets.instanceId, id),
			),
		);
	return toView(
		instance,
		secrets.map((secret) => secret.fieldKey),
	);
}

export async function createConnection(
	userId: string,
	data: CreateConnectionData,
): Promise<ConnectionView> {
	const template = assertTemplate(data.templateSlug);
	const name = data.name.trim();
	if (!name || name.length > 120) {
		throw new GatewayError(
			400,
			"INVALID_CONNECTION_NAME",
			"Connection names must be between 1 and 120 characters.",
		);
	}
	const providerSlug = assertProviderSlug(data.providerSlug);
	const baseUrl = validateUpstreamUrl(data.baseUrl, data.allowPrivateNetwork)
		.toString()
		.replace(/\/$/, "");
	const config = assertFields(template, data);
	const id = uuidv7();
	const now = new Date();
	const instanceSlug = `${slugify(name)}-${id.slice(0, 8)}`;
	const healthDueAt = new Date(
		now.getTime() + (data.healthIntervalMinutes ?? 60) * 60 * 1_000,
	);

	const secretRows = await Promise.all(
		Object.entries(data.secrets)
			.filter(([, value]) => value.length > 0)
			.map(async ([fieldKey, value]) => ({
				id: uuidv7(),
				userId,
				instanceId: id,
				fieldKey,
				envelope: await encryptSecret(
					value,
					createAssociatedData(userId, id, fieldKey),
				),
			})),
	);

	const db = getDb();
	const [instance] = await db.transaction(async (tx) => {
		const inserted = await tx
			.insert(providerInstances)
			.values({
				id,
				userId,
				templateSlug: template.slug,
				instanceSlug,
				providerSlug,
				name,
				baseUrl,
				config,
				allowPrivateNetwork: data.allowPrivateNetwork,
				healthIntervalMinutes: data.healthIntervalMinutes ?? null,
				healthDueAt,
				createdAt: now,
				updatedAt: now,
			})
			.returning();
		if (secretRows.length > 0) {
			await tx.insert(providerSecrets).values(secretRows);
		}
		return inserted;
	});

	if (!instance) {
		throw new GatewayError(
			500,
			"CONNECTION_CREATE_FAILED",
			"The connection could not be created.",
		);
	}
	recordAuditEvent({
		action: "connection.created",
		metadata: { providerSlug, templateSlug: template.slug },
		resourceId: id,
		resourceType: "connection",
		userId,
	});
	return toView(
		instance,
		secretRows.map((secret) => secret.fieldKey),
	);
}

export async function deleteConnection(
	userId: string,
	id: string,
): Promise<void> {
	const db = getDb();
	const [deleted] = await db
		.delete(providerInstances)
		.where(
			and(eq(providerInstances.userId, userId), eq(providerInstances.id, id)),
		)
		.returning({ id: providerInstances.id });
	if (!deleted) {
		throw new GatewayError(
			404,
			"CONNECTION_NOT_FOUND",
			"Connection not found.",
		);
	}
	recordAuditEvent({
		action: "connection.deleted",
		resourceId: id,
		resourceType: "connection",
		userId,
	});
}
