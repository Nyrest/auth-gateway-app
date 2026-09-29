import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import {
	authAccounts,
	authPasskeys,
	authRateLimits,
	authSessions,
	authUsers,
	authVerifications,
} from "./auth-schema";

export {
	authAccounts,
	authPasskeys,
	authRateLimits,
	authSessions,
	authUsers,
	authVerifications,
} from "./auth-schema";

const connectionStatuses = [
	"draft",
	"connecting",
	"active",
	"invalid",
] as const;
const healthStatuses = ["unknown", "healthy", "unhealthy"] as const;
const apiKeyKinds = ["user", "playground"] as const;
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = sql`(unixepoch() * 1000)`;

const timestampColumns = {
	createdAt: timestamp("created_at").notNull().default(now),
	updatedAt: timestamp("updated_at").notNull().default(now),
};

export const appSettings = sqliteTable("app_settings", {
	id: text("id").primaryKey().default("primary"),
	ownerUserId: text("owner_user_id").references(() => authUsers.id, {
		onDelete: "set null",
	}),
	publicOrigin: text("public_origin"),
	metricsCleanupDueAt: timestamp("metrics_cleanup_due_at"),
	schedulerLeaseUntil: timestamp("scheduler_lease_until"),
	...timestampColumns,
});

export const userSettings = sqliteTable("user_settings", {
	userId: text("user_id")
		.primaryKey()
		.references(() => authUsers.id, { onDelete: "cascade" }),
	healthChecksEnabled: integer("health_checks_enabled", { mode: "boolean" })
		.notNull()
		.default(true),
	defaultHealthIntervalMinutes: integer("default_health_interval_minutes")
		.notNull()
		.default(60),
	...timestampColumns,
});

export const providerInstances = sqliteTable(
	"provider_instance",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		templateSlug: text("template_slug").notNull(),
		instanceSlug: text("instance_slug").notNull(),
		providerSlug: text("provider_slug").notNull(),
		name: text("name").notNull(),
		baseUrl: text("base_url").notNull(),
		config: text("config", { mode: "json" }).notNull().default({}),
		status: text("status", { enum: connectionStatuses })
			.notNull()
			.default("draft"),
		health: text("health", { enum: healthStatuses })
			.notNull()
			.default("unknown"),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		healthIntervalMinutes: integer("health_interval_minutes"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshDueAt: timestamp("refresh_due_at"),
		refreshLeaseUntil: timestamp("refresh_lease_until"),
		healthDueAt: timestamp("health_due_at"),
		healthLeaseUntil: timestamp("health_lease_until"),
		healthFailureCount: integer("health_failure_count").notNull().default(0),
		...timestampColumns,
	},
	(table) => [
		uniqueIndex("provider_instance_user_instance_slug_idx").on(
			table.userId,
			table.instanceSlug,
		),
		index("provider_instance_user_pool_idx").on(
			table.userId,
			table.providerSlug,
		),
		index("provider_instance_active_pool_idx").on(
			table.userId,
			table.providerSlug,
			table.enabled,
			table.status,
			table.health,
		),
		index("provider_instance_refresh_claim_idx").on(
			table.enabled,
			table.status,
			table.refreshDueAt,
			table.refreshLeaseUntil,
		),
		index("provider_instance_health_claim_idx").on(
			table.enabled,
			table.healthDueAt,
			table.healthLeaseUntil,
		),
	],
);

export const providerSecrets = sqliteTable(
	"provider_secret",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		instanceId: text("instance_id")
			.notNull()
			.references(() => providerInstances.id, { onDelete: "cascade" }),
		fieldKey: text("field_key").notNull(),
		envelope: text("envelope").notNull(),
		...timestampColumns,
	},
	(table) => [
		uniqueIndex("provider_secret_instance_field_idx").on(
			table.instanceId,
			table.fieldKey,
		),
		index("provider_secret_user_instance_idx").on(
			table.userId,
			table.instanceId,
		),
	],
);

export const oauthStates = sqliteTable(
	"oauth_state",
	{
		id: text("id").primaryKey(),
		stateDigest: text("state_digest").notNull(),
		verifierEnvelope: text("verifier_envelope").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		instanceId: text("instance_id")
			.notNull()
			.references(() => providerInstances.id, { onDelete: "cascade" }),
		expiresAt: timestamp("expires_at").notNull(),
		consumedAt: timestamp("consumed_at"),
		...timestampColumns,
	},
	(table) => [
		uniqueIndex("oauth_state_digest_idx").on(table.stateDigest),
		index("oauth_state_instance_expiry_idx").on(
			table.instanceId,
			table.expiresAt,
		),
		index("oauth_state_expiry_idx").on(table.expiresAt),
	],
);

export const apiKeys = sqliteTable(
	"api_key",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		label: text("label").notNull(),
		prefix: text("prefix").notNull(),
		digest: text("digest").notNull(),
		keyKind: text("key_kind", { enum: apiKeyKinds }).notNull().default("user"),
		providerScopeMode: text("provider_scope_mode").notNull().default("all"),
		providerSlugs: text("provider_slugs", { mode: "json" })
			.notNull()
			.default([]),
		instanceIds: text("instance_ids", { mode: "json" }).notNull().default([]),
		expiresAt: timestamp("expires_at"),
		revokedAt: timestamp("revoked_at"),
		lastUsedAt: timestamp("last_used_at"),
		...timestampColumns,
	},
	(table) => [
		uniqueIndex("api_key_digest_idx").on(table.digest),
		uniqueIndex("api_key_user_playground_idx")
			.on(table.userId)
			.where(sql`${table.keyKind} = 'playground'`),
		index("api_key_user_id_idx").on(table.userId),
	],
);

export const auditEvents = sqliteTable(
	"audit_event",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		action: text("action").notNull(),
		resourceType: text("resource_type").notNull(),
		resourceId: text("resource_id"),
		result: text("result").notNull().default("success"),
		metadata: text("metadata", { mode: "json" }).notNull().default({}),
		occurredAt: timestamp("occurred_at").notNull().default(now),
	},
	(table) => [
		index("audit_event_user_occurred_idx").on(table.userId, table.occurredAt),
		index("audit_event_user_result_occurred_idx").on(
			table.userId,
			table.result,
			table.occurredAt,
		),
	],
);

export const requestMetrics = sqliteTable(
	"request_metric",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		instanceId: text("instance_id").references(() => providerInstances.id, {
			onDelete: "set null",
		}),
		apiKeyId: text("api_key_id").references(() => apiKeys.id, {
			onDelete: "set null",
		}),
		providerSlug: text("provider_slug").notNull(),
		method: text("method").notNull().default("GET"),
		path: text("path").notNull().default("/"),
		statusCode: integer("status_code").notNull(),
		latencyMs: integer("latency_ms").notNull(),
		sourceIp: text("source_ip"),
		occurredAt: timestamp("occurred_at").notNull().default(now),
	},
	(table) => [
		index("request_metric_user_occurred_idx").on(
			table.userId,
			table.occurredAt,
		),
		index("request_metric_user_provider_occurred_idx").on(
			table.userId,
			table.providerSlug,
			table.occurredAt,
		),
		index("request_metric_user_status_occurred_idx").on(
			table.userId,
			table.statusCode,
			table.occurredAt,
		),
		index("request_metric_user_instance_occurred_idx").on(
			table.userId,
			table.instanceId,
			table.occurredAt,
		),
		index("request_metric_occurred_idx").on(table.occurredAt),
	],
);

export const gatewaySchema = {
	appSettings,
	auditEvents,
	apiKeys,
	account: authAccounts,
	passkey: authPasskeys,
	oauthStates,
	providerInstances,
	providerSecrets,
	rateLimit: authRateLimits,
	requestMetrics,
	session: authSessions,
	user: authUsers,
	userSettings,
	verification: authVerifications,
};
