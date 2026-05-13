CREATE TABLE "assistant_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"priority" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"suggested_action" jsonb DEFAULT null,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_notifications" ADD CONSTRAINT "assistant_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_notifications_user_created_at_idx" ON "assistant_notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "assistant_notifications_user_kind_created_at_idx" ON "assistant_notifications" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "assistant_notifications_user_dedupe_key_idx" ON "assistant_notifications" USING btree ("user_id","dedupe_key");