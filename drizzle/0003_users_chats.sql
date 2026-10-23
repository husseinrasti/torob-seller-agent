CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"memory" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_name_key_unique" UNIQUE("name_key")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "messages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_updated_idx" ON "sessions" USING btree ("user_id","updated_at");