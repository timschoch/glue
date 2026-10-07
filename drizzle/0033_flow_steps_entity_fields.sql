ALTER TABLE "parts" ADD COLUMN "steps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "fields" jsonb DEFAULT '[]'::jsonb NOT NULL;