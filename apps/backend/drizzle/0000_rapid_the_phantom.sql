CREATE TYPE "public"."agent_job_source_transport" AS ENUM('rest', 'ws');--> statement-breakpoint
CREATE TYPE "public"."agent_job_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."conversation_type" AS ENUM('direct', 'group');--> statement-breakpoint
CREATE TYPE "public"."log_scope" AS ENUM('agent', 'audit', 'system');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('text', 'system', 'agent');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('member', 'owner');--> statement-breakpoint
CREATE TYPE "public"."presence_status" AS ENUM('online', 'offline');--> statement-breakpoint
CREATE TYPE "public"."room_type" AS ENUM('office', 'meeting');--> statement-breakpoint
CREATE TABLE "agent_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"message_id" uuid,
	"type" text NOT NULL,
	"status" "agent_job_status" DEFAULT 'pending' NOT NULL,
	"source_transport" "agent_job_source_transport" NOT NULL,
	"request_payload" jsonb,
	"response_payload" jsonb,
	"error_code" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_message_id" uuid,
	"last_read_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "participant_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "conversation_participants_joined_left_check" CHECK ("conversation_participants"."left_at" is null or "conversation_participants"."left_at" >= "conversation_participants"."joined_at")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "conversation_type" NOT NULL,
	"room_id" uuid,
	"title" text,
	"created_by" uuid,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coordinates" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"room_id" uuid,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coordinates_x_non_negative_check" CHECK ("coordinates"."x" >= 0),
	CONSTRAINT "coordinates_y_non_negative_check" CHECK ("coordinates"."y" >= 0)
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"agent_job_id" uuid,
	"scope" "log_scope" NOT NULL,
	"event_type" text NOT NULL,
	"request_payload" jsonb,
	"response_payload" jsonb,
	"error_code" text,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid,
	"message_type" "message_type" NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "presence" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"status" "presence_status" DEFAULT 'offline' NOT NULL,
	"socket_count" integer DEFAULT 0 NOT NULL,
	"current_room_id" uuid,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "room_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"password_hash" text NOT NULL,
	"sprite_sheet_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_last_read_message_id_messages_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordinates" ADD CONSTRAINT "coordinates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordinates" ADD CONSTRAINT "coordinates_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_agent_job_id_agent_jobs_id_fk" FOREIGN KEY ("agent_job_id") REFERENCES "public"."agent_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_current_room_id_rooms_id_fk" FOREIGN KEY ("current_room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_jobs_user_created_at_idx" ON "agent_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_jobs_status_created_at_idx" ON "agent_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "agent_jobs_conversation_created_at_idx" ON "agent_jobs" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_reads_conversation_user_unique_idx" ON "conversation_reads" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "conversation_reads_user_updated_at_idx" ON "conversation_reads" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_participants_conversation_user_unique_idx" ON "conversation_participants" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "conversation_participants_user_joined_at_idx" ON "conversation_participants" USING btree ("user_id","joined_at");--> statement-breakpoint
CREATE INDEX "conversation_participants_conversation_joined_at_idx" ON "conversation_participants" USING btree ("conversation_id","joined_at");--> statement-breakpoint
CREATE INDEX "conversation_participants_active_membership_idx" ON "conversation_participants" USING btree ("conversation_id","user_id") WHERE "conversation_participants"."left_at" is null;--> statement-breakpoint
CREATE INDEX "conversations_type_last_message_at_idx" ON "conversations" USING btree ("type","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_room_last_message_at_idx" ON "conversations" USING btree ("room_id","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_created_by_idx" ON "conversations" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "coordinates_room_updated_at_idx" ON "coordinates" USING btree ("room_id","updated_at");--> statement-breakpoint
CREATE INDEX "logs_agent_job_created_at_idx" ON "logs" USING btree ("agent_job_id","created_at");--> statement-breakpoint
CREATE INDEX "logs_scope_created_at_idx" ON "logs" USING btree ("scope","created_at");--> statement-breakpoint
CREATE INDEX "logs_user_created_at_idx" ON "logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_at_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_sender_created_at_idx" ON "messages" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_visible_created_at_idx" ON "messages" USING btree ("conversation_id","created_at") WHERE "messages"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "presence_status_updated_at_idx" ON "presence" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "presence_current_room_status_idx" ON "presence" USING btree ("current_room_id","status");--> statement-breakpoint
CREATE INDEX "rooms_type_created_at_idx" ON "rooms" USING btree ("type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique_idx" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");