ALTER TABLE "asks" ADD COLUMN "kind" text DEFAULT 'insight' NOT NULL;--> statement-breakpoint
ALTER TABLE "asks" ADD COLUMN "question" text;--> statement-breakpoint
ALTER TABLE "asks" ADD COLUMN "asked_by_id" integer;--> statement-breakpoint
ALTER TABLE "asks" ADD CONSTRAINT "asks_asked_by_id_members_id_fk" FOREIGN KEY ("asked_by_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asks" ADD CONSTRAINT "asks_kind_check" CHECK ("asks"."kind" in ('insight', 'decision'));