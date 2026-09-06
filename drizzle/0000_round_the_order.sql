CREATE TYPE "public"."api_key_kind" AS ENUM('user', 'playground');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('draft', 'connecting', 'active', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."health_status" AS ENUM('unknown', 'healthy', 'unhealthy');--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"prefix" text NOT NULL,
	"digest" text NOT NULL,
	"key_kind" "api_key_kind" DEFAULT 'user' NOT NULL,
	"provider_scope_mode" text DEFAULT 'all' NOT NULL,
	"provider_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"instance_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" text PRIMARY KEY DEFAULT 'primary' NOT NULL,
	"owner_user_id" uuid,
	"public_origin" text,
	"metrics_cleanup_due_at" timestamp with time zone,
	"scheduler_lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"result" text DEFAULT 'success' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_state" (
	"id" uuid PRIMARY KEY NOT NULL,
	"state_digest" text NOT NULL,
	"verifier_envelope" text NOT NULL,
	"user_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_instance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"template_slug" text NOT NULL,
	"instance_slug" text NOT NULL,
	"provider_slug" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "connection_status" DEFAULT 'draft' NOT NULL,
	"health" "health_status" DEFAULT 'unknown' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"health_interval_minutes" integer,
	"access_token_expires_at" timestamp with time zone,
	"refresh_due_at" timestamp with time zone,
	"refresh_lease_until" timestamp with time zone,
	"health_due_at" timestamp with time zone,
	"health_lease_until" timestamp with time zone,
	"health_failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_secret" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"envelope" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_metric" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"instance_id" uuid,
	"api_key_id" uuid,
	"provider_slug" text NOT NULL,
	"method" text DEFAULT 'GET' NOT NULL,
	"path" text DEFAULT '/' NOT NULL,
	"status_code" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"source_ip" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"health_checks_enabled" boolean DEFAULT true NOT NULL,
	"default_health_interval_minutes" integer DEFAULT 60 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD CONSTRAINT "oauth_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD CONSTRAINT "oauth_state_instance_id_provider_instance_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."provider_instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_instance" ADD CONSTRAINT "provider_instance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_secret" ADD CONSTRAINT "provider_secret_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_secret" ADD CONSTRAINT "provider_secret_instance_id_provider_instance_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."provider_instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_metric" ADD CONSTRAINT "request_metric_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_metric" ADD CONSTRAINT "request_metric_instance_id_provider_instance_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."provider_instance"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_metric" ADD CONSTRAINT "request_metric_api_key_id_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_digest_idx" ON "api_key" USING btree ("digest");--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_user_playground_idx" ON "api_key" USING btree ("user_id") WHERE "api_key"."key_kind" = 'playground';--> statement-breakpoint
CREATE INDEX "api_key_user_id_idx" ON "api_key" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_event_user_occurred_idx" ON "audit_event" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_event_user_result_occurred_idx" ON "audit_event" USING btree ("user_id","result","occurred_at");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_idx" ON "account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_key_idx" ON "rate_limit" USING btree ("key");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_state_digest_idx" ON "oauth_state" USING btree ("state_digest");--> statement-breakpoint
CREATE INDEX "oauth_state_instance_expiry_idx" ON "oauth_state" USING btree ("instance_id","expires_at");--> statement-breakpoint
CREATE INDEX "oauth_state_expiry_idx" ON "oauth_state" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_instance_user_instance_slug_idx" ON "provider_instance" USING btree ("user_id","instance_slug");--> statement-breakpoint
CREATE INDEX "provider_instance_user_pool_idx" ON "provider_instance" USING btree ("user_id","provider_slug");--> statement-breakpoint
CREATE INDEX "provider_instance_active_pool_idx" ON "provider_instance" USING btree ("user_id","provider_slug","enabled","status","health");--> statement-breakpoint
CREATE INDEX "provider_instance_refresh_claim_idx" ON "provider_instance" USING btree ("enabled","status","refresh_due_at","refresh_lease_until");--> statement-breakpoint
CREATE INDEX "provider_instance_health_claim_idx" ON "provider_instance" USING btree ("enabled","health_due_at","health_lease_until");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_secret_instance_field_idx" ON "provider_secret" USING btree ("instance_id","field_key");--> statement-breakpoint
CREATE INDEX "provider_secret_user_instance_idx" ON "provider_secret" USING btree ("user_id","instance_id");--> statement-breakpoint
CREATE INDEX "request_metric_user_occurred_idx" ON "request_metric" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "request_metric_user_provider_occurred_idx" ON "request_metric" USING btree ("user_id","provider_slug","occurred_at");--> statement-breakpoint
CREATE INDEX "request_metric_user_status_occurred_idx" ON "request_metric" USING btree ("user_id","status_code","occurred_at");--> statement-breakpoint
CREATE INDEX "request_metric_user_instance_occurred_idx" ON "request_metric" USING btree ("user_id","instance_id","occurred_at");--> statement-breakpoint
CREATE INDEX "request_metric_occurred_idx" ON "request_metric" USING btree ("occurred_at");