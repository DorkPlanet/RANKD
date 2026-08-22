CREATE TABLE "activity_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "activity_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_comment" ADD CONSTRAINT "activity_comment_activity_id_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_comment" ADD CONSTRAINT "activity_comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_comment_thread_idx" ON "activity_comment" USING btree ("activity_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_comment_author_idx" ON "activity_comment" USING btree ("author_id","created_at" DESC NULLS LAST);