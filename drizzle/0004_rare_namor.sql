ALTER TABLE "api_key" ADD COLUMN "permissions" jsonb DEFAULT '["proxy"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "provider_scope_mode" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "allow_private_network" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_event" ADD COLUMN "result" text DEFAULT 'success' NOT NULL;--> statement-breakpoint
ALTER TABLE "request_metric" ADD COLUMN "api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "request_metric" ADD COLUMN "method" text DEFAULT 'GET' NOT NULL;--> statement-breakpoint
ALTER TABLE "request_metric" ADD COLUMN "path" text DEFAULT '/' NOT NULL;--> statement-breakpoint
ALTER TABLE "request_metric" ADD CONSTRAINT "request_metric_api_key_id_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_event_user_result_occurred_idx" ON "audit_event" USING btree ("user_id","result","occurred_at");--> statement-breakpoint
CREATE INDEX "request_metric_user_provider_occurred_idx" ON "request_metric" USING btree ("user_id","provider_slug","occurred_at");--> statement-breakpoint
CREATE INDEX "request_metric_user_status_occurred_idx" ON "request_metric" USING btree ("user_id","status_code","occurred_at");--> statement-breakpoint
ALTER TABLE "provider_instance" DROP COLUMN "allow_private_network";