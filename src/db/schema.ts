import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import {
	authAccounts,
	authRateLimits,
	authSessions,
	authUsers,
	authVerifications,
} from "./auth-schema";

export {
	authAccounts,
	authRateLimits,
	authSessions,
	authUsers,
	authVerifications,
} from "./auth-schema";

export const connectionStatus = pgEnum("connection_status", [
	"draft",
	"connecting",
	"active",
	"invalid",
]);
export const healthStatus = pgEnum("health_status", [
	"unknown",
	"healthy",
	"unhealthy",
]);
export const apiKeyKind = pgEnum("api_key_kind", ["user", "playground"]);

const timestampColumns = {
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
};

export const appSettings = pgTable("app_settings", {
	id: text("id").primaryKey().default("primary"),
	ownerUserId: uuid("owner_user_id").references(() => authUsers.id, {
		onDelete: "set null",
	}),
	publicOrigin: text("public_origin"),
	metricsCleanupDueAt: timestamp("metrics_cleanup_due_at", {
		withTimezone: true,
	}),
	schedulerLeaseUntil: timestamp("scheduler_lease_until", {
		withTimezone: true,
	}),
	...timestampColumns,
});

export const userSettings = pgTable("user_settings", {
	userId: uuid("user_id")
		.primaryKey()
		.references(() => authUsers.id, { onDelete: "cascade" }),
	healthChecksEnabled: boolean("health_checks_enabled").notNull().default(true),
	defaultHealthIntervalMinutes: integer("default_health_interval_minutes")
		.notNull()
		.default(60),
	...timestampColumns,
});

export const providerInstances = pgTable(
	"provider_instance",
	{
		id: uuid("id").primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		templateSlug: text("template_slug").notNull(),
		instanceSlug: text("instance_slug").notNull(),
		providerSlug: text("provider_slug").notNull(),
		name: text("name").notNull(),
		baseUrl: text("base_url").notNull(),
		config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
		status: connectionStatus("status").notNull().default("draft"),
		health: healthStatus("health").notNull().default("unknown"),
		enabled: boolean("enabled").notNull().default(true),
		healthIntervalMinutes: integer("health_interval_minutes"),
		accessTokenExpiresAt: timestamp("access_token_expires_at", {
			withTimezone: true,
		}),
		refreshDueAt: timestamp("refresh_due_at", { withTimezone: true }),
		refreshLeaseUntil: timestamp("refresh_lease_until", { withTimezone: true }),
		healthDueAt: timestamp("health_due_at", { withTimezone: true }),
		healthLeaseUntil: timestamp("health_lease_until", { withTimezone: true }),
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

export const providerSecrets = pgTable(
	"provider_secret",
	{
		id: uuid("id").primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		instanceId: uuid("instance_id")
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

export const oauthStates = pgTable(
	"oauth_state",
	{
		id: uuid("id").primaryKey(),
		stateDigest: text("state_digest").notNull(),
		verifierEnvelope: text("verifier_envelope").notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		instanceId: uuid("instance_id")
			.notNull()
			.references(() => providerInstances.id, { onDelete: "cascade" }),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		consumedAt: timestamp("consumed_at", { withTimezone: true }),
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

export const apiKeys = pgTable(
	"api_key",
	{
		id: uuid("id").primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		label: text("label").notNull(),
		prefix: text("prefix").notNull(),
		digest: text("digest").notNull(),
		keyKind: apiKeyKind("key_kind").notNull().default("user"),
		providerScopeMode: text("provider_scope_mode").notNull().default("all"),
		providerSlugs: jsonb("provider_slugs").notNull().default(sql`'[]'::jsonb`),
		instanceIds: jsonb("instance_ids").notNull().default(sql`'[]'::jsonb`),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
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

export const auditEvents = pgTable(
	"audit_event",
	{
		id: uuid("id").primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		action: text("action").notNull(),
		resourceType: text("resource_type").notNull(),
		resourceId: text("resource_id"),
		result: text("result").notNull().default("success"),
		metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
		occurredAt: timestamp("occurred_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
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

export const requestMetrics = pgTable(
	"request_metric",
	{
		id: uuid("id").primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		instanceId: uuid("instance_id").references(() => providerInstances.id, {
			onDelete: "set null",
		}),
		apiKeyId: uuid("api_key_id").references(() => apiKeys.id, {
			onDelete: "set null",
		}),
		providerSlug: text("provider_slug").notNull(),
		method: text("method").notNull().default("GET"),
		path: text("path").notNull().default("/"),
		statusCode: integer("status_code").notNull(),
		latencyMs: integer("latency_ms").notNull(),
		sourceIp: text("source_ip"),
		occurredAt: timestamp("occurred_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
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
