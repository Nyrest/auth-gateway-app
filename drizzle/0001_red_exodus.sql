ALTER TABLE `app_settings` RENAME COLUMN "metrics_cleanup_due_at" TO "maintenance_cleanup_due_at";--> statement-breakpoint
DROP TABLE `audit_event`;--> statement-breakpoint
DROP TABLE `request_metric`;--> statement-breakpoint
ALTER TABLE `api_key` DROP COLUMN `last_used_at`;