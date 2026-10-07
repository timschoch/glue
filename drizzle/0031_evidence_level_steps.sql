ALTER TABLE "part_activity" DROP CONSTRAINT "part_activity_kind_check";--> statement-breakpoint
ALTER TABLE "part_activity" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "part_activity" ADD CONSTRAINT "part_activity_kind_check" CHECK ("part_activity"."kind" in ('to-check', 'waiting', 'draft', 'review', 'published', 'sunk', 'changed', 'wording', 'raised', 'verified', 'disputed'));