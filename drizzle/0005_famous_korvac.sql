CREATE TYPE "public"."api_key_kind" AS ENUM('user', 'playground');--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "key_kind" "api_key_kind" DEFAULT 'user' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_user_playground_idx" ON "api_key" USING btree ("user_id") WHERE "api_key"."key_kind" = 'playground';