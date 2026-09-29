import { and, desc, eq, inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { getDb } from "#/db/index.server";
import { providerInstances, providerSecrets } from "#/db/schema";
import {
	maximumCustomHeadersBytes,
	parseStoredHeaders,
	serializeStoredHeaders,
} from "#/lib/headers";
import { createAssociatedData, encryptSecret } from "#/server/crypto.server";
import { GatewayError } from "#/server/errors";
import { parseHttpUrl } from "#/server/url.server";
import {
	asConnectionEnabledResult,
	asJsonObject,
	type ConnectionEnabledResult,
	type ConnectionView,
	isJsonValue,
	type JsonObject,
	type JsonValue,
} from "./connections.types";
import { readConnectionSecrets, saveConnectionSecrets } from "./secrets.server";
import {
	getProviderTemplate,
	type ProviderDefinition,
	type ProviderTemplate,
} from "./templates";

export type {
	ConnectionEnabledResult,
	ConnectionView,
	JsonObject,
	JsonValue,
} from "./connections.types";
export { asJsonObject } from "./connections.types";

export type CreateConnectionData = {
	readonly templateSlug: string;
	readonly name: string;
	readonly providerSlug: string;
	readonly baseUrl: string;
	readonly config: JsonObject;
	readonly secrets: Record<string, string>;
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
	if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(slug)) {
		throw new GatewayError(
			400,
			"INVALID_PROVIDER_SLUG",
			"Provider slugs use lowercase letters, numbers, hyphens, and underscores.",
		);
	}
	return slug;
}

function assertTemplate(value: string): ProviderDefinition {
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

function isEmptyProviderValue(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		(typeof value === "string" && value.trim().length === 0)
	);
}

const maximumProviderTextBytes = 16 * 1024;
const maximumProviderJsonBytes = 64 * 1024;

function invalidProviderField(fieldKey: string, detail: string): never {
	throw new GatewayError(
		400,
		"INVALID_PROVIDER_FIELD",
		`Provider field ${fieldKey} ${detail}.`,
	);
}

function assertTextSize(fieldKey: string, value: string): void {
	const maximumBytes =
		fieldKey === "custom_headers"
			? maximumCustomHeadersBytes
			: maximumProviderTextBytes;
	if (new TextEncoder().encode(value).byteLength > maximumBytes) {
		invalidProviderField(fieldKey, "is too large");
	}
}

function assertJsonSize(fieldKey: string, value: unknown): void {
	let serialized: string;
	try {
		serialized = JSON.stringify(value);
	} catch {
		invalidProviderField(fieldKey, "must contain valid JSON");
	}
	if (
		new TextEncoder().encode(serialized).byteLength > maximumProviderJsonBytes
	) {
		invalidProviderField(fieldKey, "is too large");
	}
}

function assertKeyValueString(fieldKey: string, value: string): void {
	const parsed = parseStoredHeaders(value, "provider");
	if (!("value" in parsed)) {
		invalidProviderField(fieldKey, "must contain valid custom headers");
	}
}

function normalizeSecretValues(
	secrets: Readonly<Record<string, string>>,
): Record<string, string> {
	const value = secrets.custom_headers;
	if (!value?.trim()) return { ...secrets };
	const parsed = parseStoredHeaders(value, "provider");
	return "value" in parsed
		? { ...secrets, custom_headers: serializeStoredHeaders(parsed.value) }
		: { ...secrets };
}

function assertProviderFieldValue(
	field: ProviderTemplate["fields"][number],
	value: unknown,
): void {
	if (isEmptyProviderValue(value)) return;
	if (field.secret) {
		if (typeof value !== "string") {
			invalidProviderField(field.key, "must be text");
		}
		assertTextSize(field.key, value);
		if (field.type === "json") {
			try {
				JSON.parse(value);
			} catch {
				invalidProviderField(field.key, "must contain valid JSON");
			}
		}
		if (field.type === "key_value") assertKeyValueString(field.key, value);
		return;
	}
	switch (field.type) {
		case "string":
			if (typeof value !== "string")
				invalidProviderField(field.key, "must be text");
			assertTextSize(field.key, value);
			break;
		case "number":
			if (typeof value !== "number" || !Number.isFinite(value))
				invalidProviderField(field.key, "must be a finite number");
			break;
		case "boolean":
			if (typeof value !== "boolean")
				invalidProviderField(field.key, "must be true or false");
			break;
		case "json":
			if (!isJsonValue(value))
				invalidProviderField(field.key, "must contain valid JSON");
			assertJsonSize(field.key, value);
			break;
		case "key_value":
			if (
				!Array.isArray(value) ||
				value.some(
					(item) =>
						!item ||
						typeof item !== "object" ||
						typeof (item as { key?: unknown }).key !== "string" ||
						typeof (item as { value?: unknown }).value !== "string",
				)
			) {
				invalidProviderField(field.key, "must contain key/value entries");
			}
			assertJsonSize(field.key, value);
			break;
		case "single_select":
			if (
				typeof value !== "string" ||
				(field.options?.length && !field.options.includes(value))
			)
				invalidProviderField(field.key, "contains an unsupported option");
			break;
		case "multi_select":
			if (
				!Array.isArray(value) ||
				value.some((item) => typeof item !== "string") ||
				(field.options?.length &&
					value.some((item) => !field.options?.includes(item as string)))
			) {
				invalidProviderField(field.key, "contains unsupported options");
			}
			break;
	}
}

async function runProviderValidator(
	template: ProviderDefinition,
	input: unknown,
): Promise<void> {
	if (!template.validate) return;
	try {
		await template.validate(input);
	} catch (error) {
		if (error instanceof GatewayError) throw error;
		throw new GatewayError(
			400,
			"INVALID_PROVIDER_CONFIGURATION",
			"The provider configuration is invalid.",
		);
	}
}

function assertFields(
	template: ProviderTemplate,
	data: CreateConnectionData,
): JsonObject {
	if (
		Object.keys(data.config).length > 50 ||
		Object.keys(data.secrets).length > 50
	) {
		throw new GatewayError(
			400,
			"TOO_MANY_PROVIDER_FIELDS",
			"The connection contains too many provider fields.",
		);
	}
	const allowedKeys = new Set(template.fields.map((field) => field.key));
	const config: Record<string, JsonValue> = {};

	for (const field of template.fields) {
		if (field.key === "base_url") {
			continue;
		}
		const value = field.secret
			? data.secrets[field.key]
			: data.config[field.key];
		if (field.required && isEmptyProviderValue(value)) {
			throw new GatewayError(
				400,
				"MISSING_PROVIDER_FIELD",
				`Provider field ${field.key} is required.`,
			);
		}
		assertProviderFieldValue(field, value);
		if (!field.secret && !isEmptyProviderValue(value)) {
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
	const testMethod = config.test_method;
	if (
		testMethod === "GET" &&
		config.test_body !== undefined &&
		!isEmptyProviderValue(config.test_body)
	) {
		invalidProviderField("test_body", "cannot be used with GET");
	}
	if (template.mcp) {
		const transport = config.transport ?? template.mcp.transport;
		const sessionMode = config.session_mode ?? template.mcp.sessionMode;
		if (transport === "sse" && sessionMode !== "stateful") {
			config.session_mode = "stateful";
		}
		if (
			transport === "streamable_http" &&
			sessionMode !== "stateless" &&
			sessionMode !== "stateful"
		) {
			invalidProviderField("session_mode", "must be stateless or stateful");
		}
	}

	return config;
}

function toView(
	instance: typeof providerInstances.$inferSelect,
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
		healthIntervalMinutes: instance.healthIntervalMinutes,
		accessTokenExpiresAt: instance.accessTokenExpiresAt,
		refreshDueAt: instance.refreshDueAt,
		healthDueAt: instance.healthDueAt,
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

	return instances.map((instance) => toView(instance));
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
	const secrets = normalizeSecretValues(data.secrets);
	const config = assertFields(template, { ...data, secrets });
	const baseUrl = parseHttpUrl(data.baseUrl).toString().replace(/\/$/, "");
	await runProviderValidator(template, {
		baseUrl,
		config,
		name,
		providerSlug,
		secrets,
	});
	const id = uuidv7();
	const now = new Date();
	const instanceSlug = `${slugify(name)}-${id.slice(0, 8)}`;
	const healthDueAt = new Date(
		now.getTime() + (data.healthIntervalMinutes ?? 60) * 60 * 1_000,
	);

	const secretRows = await Promise.all(
		Object.entries(secrets)
			.filter(([fieldKey]) =>
				template.fields.some((field) => field.key === fieldKey && field.secret),
			)
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
	const insertConnection = db
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
			healthIntervalMinutes: data.healthIntervalMinutes ?? null,
			healthDueAt,
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	const [instance] =
		secretRows.length > 0
			? (
					await db.batch([
						insertConnection,
						db.insert(providerSecrets).values(secretRows),
					])
				)[0]
			: await insertConnection;

	if (!instance) {
		throw new GatewayError(
			500,
			"CONNECTION_CREATE_FAILED",
			"The connection could not be created.",
		);
	}
	return toView(instance);
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
}

export type UpdateConnectionData = {
	readonly name: string;
	readonly providerSlug: string;
	readonly baseUrl: string;
	readonly config: JsonObject;
	readonly secrets?: Record<string, string>;
	readonly clearSecrets?: readonly string[];
	readonly healthIntervalMinutes?: number | null;
};

export async function updateConnection(
	userId: string,
	id: string,
	data: UpdateConnectionData,
): Promise<ConnectionView> {
	const db = getDb();
	const [existing] = await db
		.select()
		.from(providerInstances)
		.where(
			and(eq(providerInstances.id, id), eq(providerInstances.userId, userId)),
		)
		.limit(1);
	if (!existing)
		throw new GatewayError(
			404,
			"CONNECTION_NOT_FOUND",
			"Connection not found.",
		);
	const template = assertTemplate(existing.templateSlug);
	const name = data.name.trim();
	if (!name || name.length > 120)
		throw new GatewayError(
			400,
			"INVALID_CONNECTION_NAME",
			"Connection names must be between 1 and 120 characters.",
		);
	const providerSlug = assertProviderSlug(data.providerSlug);
	const clear = data.clearSecrets ?? [];
	const secretFieldKeys = new Set(
		template.fields.filter((field) => field.secret).map((field) => field.key),
	);
	if (clear.some((fieldKey) => !secretFieldKeys.has(fieldKey))) {
		throw new GatewayError(
			400,
			"UNKNOWN_PROVIDER_FIELD",
			"Only registered secret fields can be cleared.",
		);
	}
	const oldSecrets = await readConnectionSecrets(userId, id);
	const secretUpdates = normalizeSecretValues(data.secrets ?? {});
	const nextSecrets = { ...Object.fromEntries(oldSecrets) };
	for (const key of clear) delete nextSecrets[key];
	for (const [key, value] of Object.entries(secretUpdates)) {
		if (value.trim()) nextSecrets[key] = value;
	}
	const config = assertFields(template, {
		templateSlug: existing.templateSlug,
		name,
		providerSlug,
		baseUrl: data.baseUrl,
		config: data.config,
		secrets: nextSecrets,
	});
	const baseUrl = parseHttpUrl(data.baseUrl).toString().replace(/\/$/, "");
	await runProviderValidator(template, {
		baseUrl,
		config,
		name,
		providerSlug,
		secrets: nextSecrets,
	});
	const now = new Date();
	const interval =
		data.healthIntervalMinutes === undefined
			? existing.healthIntervalMinutes
			: data.healthIntervalMinutes;
	const persistedSecretUpdates = new Map(
		Object.entries(secretUpdates).filter(
			([fieldKey, value]) =>
				value.trim().length > 0 && secretFieldKeys.has(fieldKey),
		),
	);
	const [updated] = await db
		.update(providerInstances)
		.set({
			name,
			providerSlug,
			baseUrl,
			config,
			healthIntervalMinutes: interval,
			healthDueAt:
				interval == null
					? existing.healthDueAt
					: new Date(now.getTime() + interval * 60_000),
			updatedAt: now,
		})
		.where(
			and(eq(providerInstances.id, id), eq(providerInstances.userId, userId)),
		)
		.returning();
	if (!updated) {
		throw new GatewayError(
			500,
			"CONNECTION_UPDATE_FAILED",
			"The connection could not be updated.",
		);
	}
	if (clear.length > 0) {
		await db
			.delete(providerSecrets)
			.where(
				and(
					eq(providerSecrets.instanceId, id),
					eq(providerSecrets.userId, userId),
					inArray(providerSecrets.fieldKey, [...clear]),
				),
			);
	}
	await saveConnectionSecrets(userId, id, persistedSecretUpdates, db);
	return toView(updated);
}

export async function setConnectionEnabled(
	userId: string,
	id: string,
	enabled: boolean,
): Promise<ConnectionEnabledResult> {
	const [updated] = await getDb()
		.update(providerInstances)
		.set({ enabled, updatedAt: new Date() })
		.where(
			and(eq(providerInstances.userId, userId), eq(providerInstances.id, id)),
		)
		.returning();
	if (!updated)
		throw new GatewayError(
			404,
			"CONNECTION_NOT_FOUND",
			"Connection not found.",
		);
	return asConnectionEnabledResult(updated.enabled);
}
