import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { getDb } from "#/db/index.server";
import {
	providerInstances,
	providerSecrets,
	requestMetrics,
} from "#/db/schema";
import { recordAuditEvent } from "#/server/audit.server";
import { createAssociatedData, encryptSecret } from "#/server/crypto.server";
import { GatewayError } from "#/server/errors";
import { validateConfiguredUpstreamUrl } from "#/server/upstream-url.server";
import {
	asJsonObject,
	type ConnectionDetailsView,
	type ConnectionView,
	isJsonValue,
	type JsonObject,
	type JsonValue,
} from "./connections.types";
import {
	readConnectionSecrets,
	readPublicConnectionFields,
	readPublicConnectionFieldsForInstances,
	saveConnectionSecrets,
} from "./secrets.server";
import {
	getProviderTemplate,
	type ProviderDefinition,
	type ProviderTemplate,
} from "./templates";

export type {
	ConnectionDetailsView,
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

function invalidProviderField(fieldKey: string, detail: string): never {
	throw new GatewayError(
		400,
		"INVALID_PROVIDER_FIELD",
		`Provider field ${fieldKey} ${detail}.`,
	);
}

function assertKeyValueString(fieldKey: string, value: string): void {
	const lines = value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	for (const line of lines) {
		const separator = line.indexOf(":");
		if (separator < 1 || !line.slice(separator + 1).trim()) {
			invalidProviderField(fieldKey, "must use one key: value pair per line");
		}
	}
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

type ConfiguredUpstreamValidator = (value: string) => Promise<URL>;

/**
 * Validate every user-configurable URL that may result in an outbound request.
 * Relative test URLs intentionally resolve against the validated connection base.
 */
export async function validateConnectionOutboundUrls(
	template: ProviderTemplate,
	baseUrlValue: string,
	config: JsonObject,
	validateUrl: ConfiguredUpstreamValidator = validateConfiguredUpstreamUrl,
): Promise<URL> {
	const baseUrl = await validateUrl(baseUrlValue);

	for (const field of template.fields) {
		if (!field.outboundUrl || field.key === "base_url") continue;
		const value = config[field.key];
		if (isEmptyProviderValue(value)) continue;
		if (typeof value !== "string") {
			invalidProviderField(field.key, "must be text");
		}

		let outboundUrl = value;
		if (field.outboundUrl === "relative_or_absolute") {
			try {
				outboundUrl = new URL(value, baseUrl).toString();
			} catch {
				invalidProviderField(field.key, "must contain a valid URL");
			}
		}
		await validateUrl(outboundUrl);
	}

	return baseUrl;
}

async function isBlockedByNetworkPolicy(
	template: ProviderTemplate | undefined,
	baseUrl: string,
	config: JsonObject,
): Promise<boolean> {
	try {
		if (template) {
			await validateConnectionOutboundUrls(template, baseUrl, config);
		} else {
			await validateConfiguredUpstreamUrl(baseUrl);
		}
		return false;
	} catch (error) {
		return (
			error instanceof GatewayError &&
			(error.code === "PRIVATE_UPSTREAM_BLOCKED" ||
				error.code === "UPSTREAM_DNS_UNAVAILABLE" ||
				error.code === "UPSTREAM_DNS_UNRESOLVABLE")
		);
	}
}

function migratePublicFields(
	template: ProviderTemplate,
	config: JsonObject,
	secrets: Record<string, string>,
): JsonObject {
	const next = { ...config };
	for (const field of template.fields) {
		if (
			!field.secret &&
			next[field.key] === undefined &&
			secrets[field.key] !== undefined
		) {
			next[field.key] = secrets[field.key];
		}
	}
	return next;
}

function toView(
	instance: typeof providerInstances.$inferSelect,
	secretKeys: readonly string[],
	policyBlocked = false,
	configOverride?: JsonObject,
): ConnectionView {
	return {
		id: instance.id,
		name: instance.name,
		providerSlug: instance.providerSlug,
		instanceSlug: instance.instanceSlug,
		templateSlug: instance.templateSlug,
		baseUrl: instance.baseUrl,
		config: configOverride ?? asJsonObject(instance.config),
		status: instance.status,
		health: instance.health,
		enabled: instance.enabled,
		healthIntervalMinutes: instance.healthIntervalMinutes,
		accessTokenExpiresAt: instance.accessTokenExpiresAt,
		refreshDueAt: instance.refreshDueAt,
		healthDueAt: instance.healthDueAt,
		secretKeys,
		policyBlocked,
		createdAt: instance.createdAt,
		updatedAt: instance.updatedAt,
	};
}

function actualSecretKeys(
	template: ProviderTemplate | undefined,
	keys: readonly string[],
): string[] {
	if (!template) return [...keys];
	const secretFields = new Set(
		template.fields.filter((field) => field.secret).map((field) => field.key),
	);
	return keys.filter((key) => secretFields.has(key));
}

async function publicConfigForInstance(
	userId: string,
	instance: typeof providerInstances.$inferSelect,
): Promise<JsonObject> {
	const config = asJsonObject(instance.config);
	const template = getProviderTemplate(instance.templateSlug);
	if (!template) return config;
	const publicKeys = new Set(
		template.fields
			.filter((field) => !field.secret && config[field.key] === undefined)
			.map((field) => field.key),
	);
	if (publicKeys.size === 0) return config;
	const legacyValues = await readPublicConnectionFields(
		userId,
		instance.id,
		publicKeys,
	);
	return { ...config, ...legacyValues };
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

	const legacyPublic = await readPublicConnectionFieldsForInstances(
		userId,
		instances.map((instance) => {
			const config = asJsonObject(instance.config);
			const template = getProviderTemplate(instance.templateSlug);
			return {
				id: instance.id,
				publicFieldKeys: new Set(
					template?.fields
						.filter((field) => !field.secret && config[field.key] === undefined)
						.map((field) => field.key) ?? [],
				),
			};
		}),
	);
	return Promise.all(
		instances.map(async (instance) => {
			const config = asJsonObject(instance.config);
			const configOverride = {
				...config,
				...(legacyPublic.get(instance.id) ?? {}),
			};
			const policyBlocked = await isBlockedByNetworkPolicy(
				getProviderTemplate(instance.templateSlug),
				instance.baseUrl,
				configOverride,
			);
			return toView(
				instance,
				actualSecretKeys(
					getProviderTemplate(instance.templateSlug),
					keysByInstance.get(instance.id) ?? [],
				),
				policyBlocked,
				configOverride,
			);
		}),
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
	const config = await publicConfigForInstance(userId, instance);
	const policyBlocked = await isBlockedByNetworkPolicy(
		getProviderTemplate(instance.templateSlug),
		instance.baseUrl,
		config,
	);
	return toView(
		instance,
		actualSecretKeys(
			getProviderTemplate(instance.templateSlug),
			secrets.map((secret) => secret.fieldKey),
		),
		policyBlocked,
		config,
	);
}

export async function getConnectionDetails(
	userId: string,
	id: string,
): Promise<ConnectionDetailsView> {
	const connection = await getConnection(userId, id);
	const from = new Date(Date.now() - 24 * 60 * 60_000);
	const [metrics] = await getDb()
		.select({
			requests: sql<number>`count(*)::int`,
			failures: sql<number>`count(*) filter (where ${requestMetrics.statusCode} >= 400)::int`,
			// PostgreSQL's percentile_cont returns double precision; round() only
			// accepts numeric, so cast before rounding to keep the detail query valid.
			p95LatencyMs: sql<number>`coalesce(round((percentile_cont(0.95) within group (order by ${requestMetrics.latencyMs}))::numeric), 0)::int`,
		})
		.from(requestMetrics)
		.where(
			and(
				eq(requestMetrics.userId, userId),
				eq(requestMetrics.instanceId, id),
				gte(requestMetrics.occurredAt, from),
			),
		);
	const requests = Number(metrics?.requests ?? 0);
	const failures = Number(metrics?.failures ?? 0);
	return {
		...connection,
		metrics24h: {
			requests,
			successRate: requests > 0 ? (requests - failures) / requests : 1,
			p95LatencyMs: Number(metrics?.p95LatencyMs ?? 0),
		},
	};
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
	const config = assertFields(template, {
		...data,
		config: migratePublicFields(template, data.config, data.secrets),
	});
	const baseUrl = (
		await validateConnectionOutboundUrls(template, data.baseUrl, config)
	)
		.toString()
		.replace(/\/$/, "");
	await runProviderValidator(template, {
		baseUrl,
		config,
		name,
		providerSlug,
		secrets: data.secrets,
	});
	const id = uuidv7();
	const now = new Date();
	const instanceSlug = `${slugify(name)}-${id.slice(0, 8)}`;
	const healthDueAt = new Date(
		now.getTime() + (data.healthIntervalMinutes ?? 60) * 60 * 1_000,
	);

	const secretRows = await Promise.all(
		Object.entries(data.secrets)
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
	const oldSecrets = await readConnectionSecrets(userId, id);
	const nextSecrets = { ...Object.fromEntries(oldSecrets) };
	for (const key of data.clearSecrets ?? []) delete nextSecrets[key];
	for (const [key, value] of Object.entries(data.secrets ?? {})) {
		if (value.trim()) nextSecrets[key] = value;
	}
	const config = assertFields(template, {
		templateSlug: existing.templateSlug,
		name,
		providerSlug,
		baseUrl: data.baseUrl,
		config: migratePublicFields(template, data.config, nextSecrets),
		secrets: nextSecrets,
	});
	const baseUrl = (
		await validateConnectionOutboundUrls(template, data.baseUrl, config)
	)
		.toString()
		.replace(/\/$/, "");
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
	if (!updated)
		throw new GatewayError(
			500,
			"CONNECTION_UPDATE_FAILED",
			"The connection could not be updated.",
		);
	const clear = data.clearSecrets ?? [];
	if (clear.length > 0)
		await db
			.delete(providerSecrets)
			.where(
				and(
					eq(providerSecrets.instanceId, id),
					eq(providerSecrets.userId, userId),
					inArray(providerSecrets.fieldKey, [...clear]),
				),
			);
	await saveConnectionSecrets(
		userId,
		id,
		new Map(
			Object.entries(data.secrets ?? {}).filter(
				([fieldKey, value]) =>
					Boolean(value) &&
					template.fields.some(
						(field) => field.key === fieldKey && field.secret,
					),
			),
		),
	);
	const publicSecretKeys = template.fields
		.filter((field) => !field.secret)
		.map((field) => field.key);
	if (publicSecretKeys.length > 0) {
		await db
			.delete(providerSecrets)
			.where(
				and(
					eq(providerSecrets.instanceId, id),
					eq(providerSecrets.userId, userId),
					inArray(providerSecrets.fieldKey, publicSecretKeys),
				),
			);
	}
	recordAuditEvent({
		action: "connection.updated",
		metadata: { providerSlug },
		resourceId: id,
		resourceType: "connection",
		userId,
	});
	const secretRows = await db
		.select({ fieldKey: providerSecrets.fieldKey })
		.from(providerSecrets)
		.where(
			and(
				eq(providerSecrets.userId, userId),
				eq(providerSecrets.instanceId, id),
			),
		);
	return toView(
		updated,
		actualSecretKeys(
			getProviderTemplate(updated.templateSlug),
			secretRows.map((row) => row.fieldKey),
		),
	);
}

export async function setConnectionEnabled(
	userId: string,
	id: string,
	enabled: boolean,
): Promise<ConnectionView> {
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
	recordAuditEvent({
		action: enabled ? "connection.enabled" : "connection.disabled",
		resourceId: id,
		resourceType: "connection",
		userId,
	});
	const secrets = await getDb()
		.select({ fieldKey: providerSecrets.fieldKey })
		.from(providerSecrets)
		.where(
			and(
				eq(providerSecrets.userId, userId),
				eq(providerSecrets.instanceId, id),
			),
		);
	return toView(
		updated,
		actualSecretKeys(
			getProviderTemplate(updated.templateSlug),
			secrets.map((row) => row.fieldKey),
		),
	);
}
