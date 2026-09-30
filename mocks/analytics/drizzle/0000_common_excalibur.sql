CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project" text NOT NULL,
	"name" text NOT NULL,
	"distinct_id" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"properties" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_project_name_timestamp_index" ON "events" USING btree ("project","name","timestamp");