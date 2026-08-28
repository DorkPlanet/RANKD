-- Threads: two people, one film.
--
-- Hand-written rather than generated. `drizzle-kit generate` needs an
-- interactive answer about whether `report.comment_id` became `message_id` or
-- was replaced, and it was replaced: comments are retired and the table is
-- empty, so there is nothing to carry across.

CREATE TABLE IF NOT EXISTS "thread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"low_id" uuid NOT NULL,
	"high_id" uuid NOT NULL,
	"subject_id" text NOT NULL,
	"meta" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thread_ordered" CHECK ("thread"."low_id" < "thread"."high_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "thread_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "thread" ADD CONSTRAINT "thread_low_id_user_id_fk" FOREIGN KEY ("low_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread" ADD CONSTRAINT "thread_high_id_user_id_fk" FOREIGN KEY ("high_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_message" ADD CONSTRAINT "thread_message_thread_id_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_message" ADD CONSTRAINT "thread_message_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "thread_pair_idx" ON "thread" USING btree ("low_id","high_id","subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "thread_low_idx" ON "thread" USING btree ("low_id","last_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "thread_high_idx" ON "thread" USING btree ("high_id","last_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "thread_message_idx" ON "thread_message" USING btree ("thread_id","created_at");--> statement-breakpoint

-- Reports move from comments to messages. The table is empty, so this replaces
-- the column rather than migrating it.
-- Guarded, because this file is now journaled and therefore re-runnable.
-- Dropping unconditionally was safe exactly once, when `report` still had the
-- `comment_id` column and was empty. Run a second time against a database that
-- has already migrated, it would delete every report anybody had filed. So it
-- drops only the OLD shape, which is the only one that needs replacing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'report' AND column_name = 'comment_id'
  ) THEN
    DROP TABLE "report";
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"message_id" uuid NOT NULL REFERENCES "public"."thread_message"("id") ON DELETE cascade,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "report_once_idx" ON "report" USING btree ("reporter_id","message_id");
