CREATE TABLE "taste_snapshot" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"entries" jsonb NOT NULL,
	"film_count" integer NOT NULL,
	"duel_count" integer NOT NULL,
	"summary" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "taste_snapshot" ADD CONSTRAINT "taste_snapshot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;