CREATE TABLE "flags" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "flags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"part_id" integer NOT NULL,
	"cause_part_id" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "flags_reason_check" CHECK ("flags"."reason" in ('changed', 'not-ready', 'wrong'))
);
--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "trust" text DEFAULT 'not-ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "work_state" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
-- The defaults are for a new Part: a draft that nobody relies on. A Part from
-- before this migration gets its Trust and its Work state from its status
-- (D39). A Part with no status, and a Goal, is published and solid. A
-- published Part was published before.
UPDATE "parts" SET
	"published_at" = CASE
		WHEN "status" IN ('proposed', 'draft', 'superseded') THEN NULL
		ELSE now()
	END,
	"trust" = CASE "status"
		WHEN 'proposed' THEN 'not-ready'
		WHEN 'draft' THEN 'not-ready'
		WHEN 'superseded' THEN 'wrong'
		ELSE 'solid'
	END,
	"work_state" = CASE "status"
		WHEN 'proposed' THEN 'review'
		WHEN 'draft' THEN 'draft'
		WHEN 'superseded' THEN 'sunk'
		ELSE 'published'
	END;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "awaited_part_id" integer;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_cause_part_id_parts_id_fk" FOREIGN KEY ("cause_part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flags_open_unique" ON "flags" USING btree ("part_id","cause_part_id","reason") WHERE "flags"."closed_at" is null;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_awaited_part_id_parts_id_fk" FOREIGN KEY ("awaited_part_id") REFERENCES "public"."parts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_trust_check" CHECK ("parts"."trust" in ('solid', 'flagged', 'not-ready', 'wrong'));--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_work_state_check" CHECK ("parts"."work_state" in ('to-check', 'waiting', 'draft', 'review', 'published', 'sunk'));