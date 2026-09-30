ALTER TABLE "products" ADD COLUMN "social_handle" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "comments_read_until" timestamp (3) with time zone;