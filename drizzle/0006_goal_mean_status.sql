ALTER TABLE "goals" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "baseline" double precision;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "latest_value" double precision;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "measured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_status_check" CHECK ("goals"."status" in ('open', 'achieved'));--> statement-breakpoint
-- A stored measure without a kind is a funnel.
UPDATE "goals" SET "measure" = jsonb_build_object('kind', 'funnel') || "measure" WHERE "measure" IS NOT NULL AND NOT "measure" ? 'kind';