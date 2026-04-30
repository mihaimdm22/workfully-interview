CREATE TABLE IF NOT EXISTS "share_links" (
	"slug" varchar(32) PRIMARY KEY NOT NULL,
	"screening_id" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_screening_id_unique" UNIQUE("screening_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "share_links" ADD CONSTRAINT "share_links_screening_id_screenings_id_fk" FOREIGN KEY ("screening_id") REFERENCES "public"."screenings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
