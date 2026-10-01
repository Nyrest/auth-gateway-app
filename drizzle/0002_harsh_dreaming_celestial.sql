PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `provider_instance_user_id_id_idx` ON `provider_instance` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `__new_oauth_state` (
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
	FOREIGN KEY (`user_id`,`instance_id`) REFERENCES `provider_instance`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_oauth_state`("id", "state_digest", "verifier_envelope", "user_id", "instance_id", "expires_at", "consumed_at", "created_at", "updated_at") SELECT "id", "state_digest", "verifier_envelope", "user_id", "instance_id", "expires_at", "consumed_at", "created_at", "updated_at" FROM `oauth_state`;--> statement-breakpoint
DROP TABLE `oauth_state`;--> statement-breakpoint
ALTER TABLE `__new_oauth_state` RENAME TO `oauth_state`;--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_state_digest_idx` ON `oauth_state` (`state_digest`);--> statement-breakpoint
CREATE INDEX `oauth_state_instance_expiry_idx` ON `oauth_state` (`instance_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `oauth_state_expiry_idx` ON `oauth_state` (`expires_at`);--> statement-breakpoint
CREATE TABLE `__new_provider_secret` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`instance_id` text NOT NULL,
	`field_key` text NOT NULL,
	`envelope` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`instance_id`) REFERENCES `provider_instance`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_provider_secret`("id", "user_id", "instance_id", "field_key", "envelope", "created_at", "updated_at") SELECT "id", "user_id", "instance_id", "field_key", "envelope", "created_at", "updated_at" FROM `provider_secret`;--> statement-breakpoint
DROP TABLE `provider_secret`;--> statement-breakpoint
ALTER TABLE `__new_provider_secret` RENAME TO `provider_secret`;--> statement-breakpoint
CREATE UNIQUE INDEX `provider_secret_instance_field_idx` ON `provider_secret` (`instance_id`,`field_key`);--> statement-breakpoint
CREATE INDEX `provider_secret_user_instance_idx` ON `provider_secret` (`user_id`,`instance_id`);
