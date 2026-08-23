ALTER TYPE "public"."activity_kind" ADD VALUE 'added';--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'locked';--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'session';--> statement-breakpoint
CREATE TABLE "activity_like" (
	"activity_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_like_activity_id_actor_id_pk" PRIMARY KEY("activity_id","actor_id")
);
--> statement-breakpoint
ALTER TABLE "activity_like" ADD CONSTRAINT "activity_like_activity_id_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_like" ADD CONSTRAINT "activity_like_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_like_actor_idx" ON "activity_like" USING btree ("actor_id","created_at" DESC NULLS LAST);