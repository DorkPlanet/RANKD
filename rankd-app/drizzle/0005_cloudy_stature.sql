CREATE TYPE "public"."account_kind" AS ENUM('person', 'house');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "kind" "account_kind" DEFAULT 'person' NOT NULL;