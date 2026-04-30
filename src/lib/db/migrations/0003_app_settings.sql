CREATE TABLE IF NOT EXISTS "app_settings" (
	"id" varchar(16) PRIMARY KEY NOT NULL,
	"model" varchar(128) NOT NULL,
	"timeout_ms" integer NOT NULL,
	"max_retries" integer NOT NULL,
	"temperature" real NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "app_settings" ("id", "model", "timeout_ms", "max_retries", "temperature")
VALUES ('singleton', 'anthropic/claude-haiku-4.5', 60000, 0, 0.2)
ON CONFLICT ("id") DO NOTHING;
