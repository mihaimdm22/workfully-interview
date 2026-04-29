CREATE TYPE "public"."message_role" AS ENUM('user', 'bot', 'system');--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"fsm_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(32) NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"attachment_name" text,
	"attachment_bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screenings" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(32) NOT NULL,
	"job_description" text NOT NULL,
	"cv" text NOT NULL,
	"result" jsonb NOT NULL,
	"model" varchar(64) NOT NULL,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_updated_at_idx" ON "conversations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "screenings_conversation_idx" ON "screenings" USING btree ("conversation_id");