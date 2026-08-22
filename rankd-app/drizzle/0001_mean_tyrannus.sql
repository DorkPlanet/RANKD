CREATE TYPE "public"."profile_visibility" AS ENUM('private', 'public');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "handle_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "avatar_source" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profile_visibility" "profile_visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "taste_visibility" "profile_visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "deleted_at" timestamp with time zone;