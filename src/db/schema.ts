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
	ownerUserId: text("owner_user_id").references(() => authUsers.id, {
		onDelete: "set null",
	}),
	setupClaim: text("setup_claim"),
	setupClaimExpiresAt: timestamp("setup_claim_expires_at", {
		withTimezone: true,
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

export const userSettings = pgTable(
	"user_settings",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		healthChecksEnabled: boolean("health_checks_enabled")
			.notNull()
			.default(true),
		defaultHealthIntervalMinutes: integer("default_health_interval_minutes")
			.notNull()
			.default(60),
		...timestampColumns,
	},
	(table) => [index("user_settings_user_id_idx").on(table.userId)],
);

export const providerInstances = pgTable(
	"provider_instance",
	{
		id: uuid("id").primaryKey(),
		userId: text("user_id")
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
		allowPrivateNetwork: boolean("allow_private_network")
			.notNull()
			.default(false),
		healthIntervalMinutes: integer("health_interval_minutes"),
		accessTokenExpiresAt: timestamp("access_token_expires_at", {
			withTimezone: true,
		}),
		refreshDueAt: timestamp("refresh_due_at", { withTimezone: true }),
		refreshLeaseUntil: timestamp("refresh_lease_until", { withTimezone: true }),
		healthDueAt: timestamp("health_due_at", { withTimezone: true }),
		healthLeaseUntil: timestamp("health_lease_until", { withTimezone: true }),
		healthFailureCount: integer("health_failure_count").notNull().default(0),
		scheduleRevision: integer("schedule_revision").notNull().default(0),
		...timestampColumns,
	},
	(table) => [
		uniqueIndex("provider_instance_instance_slug_idx").on(table.instanceSlug),
		index("provider_instance_user_pool_idx").on(
			table.userId,
			table.providerSlug,
		),
		index("provider_instance_refresh_due_idx").on(table.refreshDueAt),
		index("provider_instance_health_due_idx").on(table.healthDueAt),
	],
);

export const providerSecrets = pgTable(
	"provider_secret",
	{
		id: uuid("id").primaryKey(),
		userId: text("user_id")
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
		userId: text("user_id")
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
	],
);

export const apiKeys = pgTable(
	"api_key",
	{
		id: uuid("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		label: text("label").notNull(),
		prefix: text("prefix").notNull(),
		digest: text("digest").notNull(),
		providerSlugs: jsonb("provider_slugs").notNull().default(sql`'[]'::jsonb`),
		instanceIds: jsonb("instance_ids").notNull().default(sql`'[]'::jsonb`),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
		...timestampColumns,
	},
	(table) => [
		uniqueIndex("api_key_digest_idx").on(table.digest),
		index("api_key_user_id_idx").on(table.userId),
	],
);

export const auditEvents = pgTable(
	"audit_event",
	{
		id: uuid("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		action: text("action").notNull(),
		resourceType: text("resource_type").notNull(),
		resourceId: text("resource_id"),
		metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
		occurredAt: timestamp("occurred_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("audit_event_user_occurred_idx").on(table.userId, table.occurredAt),
	],
);

export const requestMetrics = pgTable(
	"request_metric",
	{
		id: uuid("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		instanceId: uuid("instance_id").references(() => providerInstances.id, {
			onDelete: "set null",
		}),
		providerSlug: text("provider_slug").notNull(),
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
