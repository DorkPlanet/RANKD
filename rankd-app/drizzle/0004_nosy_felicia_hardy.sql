CREATE TABLE "rate_limit" (
	"user_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_user_id_bucket_pk" PRIMARY KEY("user_id","bucket")
);
--> statement-breakpoint
ALTER TABLE "rate_limit" ADD CONSTRAINT "rate_limit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;