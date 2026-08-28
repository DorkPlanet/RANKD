-- Takes: why a film somebody locked is where it is, published.
--
-- Its own table rather than a kind of `activity`, for two reasons written up in
-- full on the table in schema.ts. The short version of the second one is that it
-- could not have been an activity kind: enforcing one take per person per film
-- needs a unique index partial on `kind = 'take'`, drizzle's migrator runs every
-- pending migration inside ONE transaction, and Postgres will not let a
-- transaction both add an enum value and use it. That fails on every fresh
-- database, which is the one case a migration exists for.
--
-- Hand-written and idempotent, matching 0012's style.

CREATE TABLE IF NOT EXISTS "take" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"subject_id" text NOT NULL,
	"meta" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- The pair IS the identity: one take per person per film, edited in place. This
-- is what the upsert in `syncTakes` conflicts on, and it is what keeps a take's
-- id stable across an edit so replies stay attached to it.
CREATE UNIQUE INDEX IF NOT EXISTS "take_once_idx" ON "take" USING btree ("author_id","subject_id");
--> statement-breakpoint
-- A profile shelf, and the feed: everything one person has said, newest first.
CREATE INDEX IF NOT EXISTS "take_author_idx" ON "take" USING btree ("author_id","created_at" DESC NULLS LAST);
