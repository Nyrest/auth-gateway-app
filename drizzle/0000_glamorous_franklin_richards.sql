CREATE TABLE `api_key` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`prefix` text NOT NULL,
	`digest` text NOT NULL,
	`key_kind` text DEFAULT 'user' NOT NULL,
	`provider_scope_mode` text DEFAULT 'all' NOT NULL,
	`provider_slugs` text DEFAULT '[]' NOT NULL,
	`instance_ids` text DEFAULT '[]' NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`last_used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_key_digest_idx` ON `api_key` (`digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `api_key_user_playground_idx` ON `api_key` (`user_id`) WHERE "api_key"."key_kind" = 'playground';--> statement-breakpoint
CREATE INDEX `api_key_user_id_idx` ON `api_key` (`user_id`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` text PRIMARY KEY DEFAULT 'primary' NOT NULL,
	`owner_user_id` text,
	`public_origin` text,
	`metrics_cleanup_due_at` integer,
	`scheduler_lease_until` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `audit_event` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`result` text DEFAULT 'success' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`occurred_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audit_event_user_occurred_idx` ON `audit_event` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_event_user_result_occurred_idx` ON `audit_event` (`user_id`,`result`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_provider_account_idx` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text,
	`created_at` integer,
	`aaguid` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passkey_user_id_idx` ON `passkey` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `passkey_credential_id_idx` ON `passkey` (`credential_id`);--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_key_idx` ON `rate_limit` (`key`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `oauth_state` (
	`id` text PRIMARY KEY NOT NULL,
	`state_digest` text NOT NULL,
	`verifier_envelope` text NOT NULL,
	`user_id` text NOT NULL,
	`instance_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instance_id`) REFERENCES `provider_instance`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_state_digest_idx` ON `oauth_state` (`state_digest`);--> statement-breakpoint
CREATE INDEX `oauth_state_instance_expiry_idx` ON `oauth_state` (`instance_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `oauth_state_expiry_idx` ON `oauth_state` (`expires_at`);--> statement-breakpoint
CREATE TABLE `provider_instance` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`template_slug` text NOT NULL,
	`instance_slug` text NOT NULL,
	`provider_slug` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`health` text DEFAULT 'unknown' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`health_interval_minutes` integer,
	`access_token_expires_at` integer,
	`refresh_due_at` integer,
	`refresh_lease_until` integer,
	`health_due_at` integer,
	`health_lease_until` integer,
	`health_failure_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_instance_user_instance_slug_idx` ON `provider_instance` (`user_id`,`instance_slug`);--> statement-breakpoint
CREATE INDEX `provider_instance_user_pool_idx` ON `provider_instance` (`user_id`,`provider_slug`);--> statement-breakpoint
CREATE INDEX `provider_instance_active_pool_idx` ON `provider_instance` (`user_id`,`provider_slug`,`enabled`,`status`,`health`);--> statement-breakpoint
CREATE INDEX `provider_instance_refresh_claim_idx` ON `provider_instance` (`enabled`,`status`,`refresh_due_at`,`refresh_lease_until`);--> statement-breakpoint
CREATE INDEX `provider_instance_health_claim_idx` ON `provider_instance` (`enabled`,`health_due_at`,`health_lease_until`);--> statement-breakpoint
CREATE TABLE `provider_secret` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`instance_id` text NOT NULL,
	`field_key` text NOT NULL,
	`envelope` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instance_id`) REFERENCES `provider_instance`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_secret_instance_field_idx` ON `provider_secret` (`instance_id`,`field_key`);--> statement-breakpoint
CREATE INDEX `provider_secret_user_instance_idx` ON `provider_secret` (`user_id`,`instance_id`);--> statement-breakpoint
CREATE TABLE `request_metric` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`instance_id` text,
	`api_key_id` text,
	`provider_slug` text NOT NULL,
	`method` text DEFAULT 'GET' NOT NULL,
	`path` text DEFAULT '/' NOT NULL,
	`status_code` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`source_ip` text,
	`occurred_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instance_id`) REFERENCES `provider_instance`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_key`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `request_metric_user_occurred_idx` ON `request_metric` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `request_metric_user_provider_occurred_idx` ON `request_metric` (`user_id`,`provider_slug`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `request_metric_user_status_occurred_idx` ON `request_metric` (`user_id`,`status_code`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `request_metric_user_instance_occurred_idx` ON `request_metric` (`user_id`,`instance_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `request_metric_occurred_idx` ON `request_metric` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`health_checks_enabled` integer DEFAULT true NOT NULL,
	`default_health_interval_minutes` integer DEFAULT 60 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `app_settings` (`id`) VALUES ('primary') ON CONFLICT (`id`) DO NOTHING;
