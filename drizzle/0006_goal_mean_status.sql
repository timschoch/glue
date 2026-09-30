ALTER TABLE "goals" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "baseline" double precision;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "latest_value" double precision;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "measured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_status_check" CHECK ("goals"."status" in ('open', 'achieved'));--> statement-breakpoint
-- A stored measure without a kind is a funnel. Only an object can get a key.
UPDATE "goals" SET "measure" = jsonb_build_object('kind', 'funnel') || "measure" WHERE jsonb_typeof("measure") = 'object' AND NOT "measure" ? 'kind';