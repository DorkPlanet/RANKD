CREATE TABLE "ranking_history" (
	"user_id" uuid NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"entries" jsonb NOT NULL,
	"film_count" integer NOT NULL,
	"contributors" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ranking_history_user_id_captured_at_pk" PRIMARY KEY("user_id","captured_at")
);
--> statement-breakpoint
ALTER TABLE "ranking_history" ADD CONSTRAINT "ranking_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ranking_history_user_idx" ON "ranking_history" USING btree ("user_id","captured_at" DESC NULLS LAST);