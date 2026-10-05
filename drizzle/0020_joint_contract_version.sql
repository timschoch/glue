ALTER TABLE "flags" DROP CONSTRAINT "flags_reason_check";--> statement-breakpoint
ALTER TABLE "joints" ADD COLUMN "contract_version" integer;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_reason_check" CHECK ("flags"."reason" in ('changed', 'not-ready', 'wrong', 'off-target', 'new-version'));