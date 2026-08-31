ALTER TABLE "api_key" DROP CONSTRAINT IF EXISTS "api_key_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "app_settings" DROP CONSTRAINT IF EXISTS "app_settings_owner_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "audit_event" DROP CONSTRAINT IF EXISTS "audit_event_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "account" DROP CONSTRAINT IF EXISTS "account_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "oauth_state" DROP CONSTRAINT IF EXISTS "oauth_state_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "provider_instance" DROP CONSTRAINT IF EXISTS "provider_instance_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "provider_secret" DROP CONSTRAINT IF EXISTS "provider_secret_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "request_metric" DROP CONSTRAINT IF EXISTS "request_metric_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "user_settings" DROP CONSTRAINT IF EXISTS "user_settings_user_id_user_id_fk";--> statement-breakpoint

CREATE FUNCTION pg_temp.auth_gateway_uuidv7()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
	random_hex text := replace(gen_random_uuid()::text, '-', '');
	timestamp_hex text := lpad(to_hex((extract(epoch FROM clock_timestamp()) * 1000)::bigint), 12, '0');
BEGIN
	RETURN (
		timestamp_hex
		|| '7'
		|| substr(random_hex, 14, 3)
		|| substr('89ab', floor(random() * 4)::integer + 1, 1)
		|| substr(random_hex, 18, 15)
	)::uuid;
END;
$$;--> statement-breakpoint

CREATE TEMP TABLE auth_gateway_user_id_map (
	old_id text PRIMARY KEY,
	new_id uuid NOT NULL UNIQUE
);--> statement-breakpoint

INSERT INTO auth_gateway_user_id_map (old_id, new_id)
SELECT "id", pg_temp.auth_gateway_uuidv7()
FROM "user";--> statement-breakpoint

CREATE FUNCTION pg_temp.auth_gateway_map_user_id(value text)
RETURNS uuid
LANGUAGE sql
STABLE
STRICT
AS $$
	SELECT new_id
	FROM auth_gateway_user_id_map
	WHERE old_id = value
$$;--> statement-breakpoint

UPDATE "account"
SET "account_id" = pg_temp.auth_gateway_map_user_id("account_id")::text
WHERE "issuer" = 'local:credential'
	AND "account_id" IN (SELECT old_id FROM auth_gateway_user_id_map);--> statement-breakpoint

ALTER TABLE "api_key" ALTER COLUMN "user_id" SET DATA TYPE uuid USING pg_temp.auth_gateway_map_user_id("user_id");--> statement-breakpoint
ALTER TABLE "app_settings" ALTER COLUMN "owner_user_id" SET DATA TYPE uuid USING pg_temp.auth_gateway_map_user_id("owner_user_id");--> statement-breakpoint
ALTER TABLE "audit_event" ALTER COLUMN "user_id" SET DATA TYPE uuid USING pg_temp.auth_gateway_map_user_id("user_id");--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "user_id" SET DATA TYPE uuid USING pg_temp.auth_gateway_map_user_id("user_id");--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "user_id" SET DATA TYPE uuid USING pg_temp.auth_gateway_map_user_id("user_id");--> statement-breakpoint
ALTER TABLE "oauth_state" ALTER COLUMN "user_id" SET DATA TYPE uuid USING pg_temp.auth_gateway_map_user_id("user_id");--> statement-breakpoint
ALTER TABLE "provider_instance" ALTER COLUMN "user_id" SET DATA TYPE uuid USING pg_temp.auth_gateway_map_user_id("user_id");--> statement-breakpoint
ALTER TABLE "provider_secret" ALTER COLUMN "user_id" SET DATA TYPE uuid USING pg_temp.auth_gateway_map_user_id("user_id");--> statement-breakpoint
ALTER TABLE "request_metric" ALTER COLUMN "user_id" SET DATA TYPE uuid USING pg_temp.auth_gateway_map_user_id("user_id");--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "user_id" SET DATA TYPE uuid USING pg_temp.auth_gateway_map_user_id("user_id");--> statement-breakpoint

ALTER TABLE "account" ALTER COLUMN "id" SET DATA TYPE uuid USING pg_temp.auth_gateway_uuidv7();--> statement-breakpoint
ALTER TABLE "rate_limit" ALTER COLUMN "id" SET DATA TYPE uuid USING pg_temp.auth_gateway_uuidv7();--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "id" SET DATA TYPE uuid USING pg_temp.auth_gateway_uuidv7();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "id" SET DATA TYPE uuid USING pg_temp.auth_gateway_map_user_id("id");--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "id" SET DATA TYPE uuid USING pg_temp.auth_gateway_uuidv7();--> statement-breakpoint

ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD CONSTRAINT "oauth_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_instance" ADD CONSTRAINT "provider_instance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_secret" ADD CONSTRAINT "provider_secret_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_metric" ADD CONSTRAINT "request_metric_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
