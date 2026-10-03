CREATE TABLE "concepts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "concepts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"parent_id" integer,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"kind" text,
	CONSTRAINT "concepts_project_id_slug_unique" UNIQUE("project_id","slug"),
	CONSTRAINT "concepts_project_id_id_unique" UNIQUE("project_id","id"),
	CONSTRAINT "concepts_kind_check" CHECK ("concepts"."kind" in ('brief'))
);
--> statement-breakpoint
CREATE TABLE "joints" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "joints_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"part_id" integer NOT NULL,
	"needed_part_id" integer NOT NULL,
	"two_way" boolean DEFAULT false NOT NULL,
	CONSTRAINT "joints_parts_differ_check" CHECK ("joints"."part_id" <> "joints"."needed_part_id")
);
--> statement-breakpoint
CREATE TABLE "measures" (
	"part_id" integer PRIMARY KEY NOT NULL,
	"measure" jsonb NOT NULL,
	"baseline" double precision,
	"latest_value" double precision,
	"latest_breakdown_value" text,
	"measured_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "part_counters" (
	"project_id" integer NOT NULL,
	"type" text NOT NULL,
	"last_number" integer NOT NULL,
	CONSTRAINT "part_counters_project_id_type_pk" PRIMARY KEY("project_id","type")
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "parts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"concept_id" integer NOT NULL,
	"type" text NOT NULL,
	"record_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"owner" text,
	"status" text,
	"date" date,
	"source" text,
	"metric" text,
	"enforced_by" text,
	"issue_url" text,
	"evidence_level" text,
	"superseded_by_id" integer,
	CONSTRAINT "parts_project_id_record_id_unique" UNIQUE("project_id","record_id"),
	CONSTRAINT "parts_type_check" CHECK ("parts"."type" in ('insight', 'goal', 'decision', 'guardrail', 'entity', 'flow', 'metric')),
	CONSTRAINT "parts_evidence_level_check" CHECK ("parts"."evidence_level" in ('hunch', 'pattern', 'confirmed')),
	CONSTRAINT "parts_type_fields_check" CHECK (case "parts"."type"
        when 'goal' then coalesce("parts"."status", '') in ('open', 'achieved') and "parts"."metric" is not null and "parts"."source" is not null
        when 'decision' then coalesce("parts"."status", '') in ('proposed', 'accepted', 'superseded') and "parts"."date" is not null and "parts"."owner" is not null
        when 'insight' then coalesce("parts"."status", 'draft') = 'draft' and "parts"."date" is not null and "parts"."source" is not null
        when 'guardrail' then "parts"."enforced_by" is not null and "parts"."status" is null
        else "parts"."status" is null
      end)
);
--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_project_id_parent_id_concepts_project_id_id_fk" FOREIGN KEY ("project_id","parent_id") REFERENCES "public"."concepts"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joints" ADD CONSTRAINT "joints_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joints" ADD CONSTRAINT "joints_needed_part_id_parts_id_fk" FOREIGN KEY ("needed_part_id") REFERENCES "public"."parts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measures" ADD CONSTRAINT "measures_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_counters" ADD CONSTRAINT "part_counters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_superseded_by_id_parts_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_project_id_concept_id_concepts_project_id_id_fk" FOREIGN KEY ("project_id","concept_id") REFERENCES "public"."concepts"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "concepts_root_unique" ON "concepts" USING btree ("project_id") WHERE "concepts"."parent_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "joints_pair_unique" ON "joints" USING btree (least("part_id", "needed_part_id"),greatest("part_id", "needed_part_id"));--> statement-breakpoint
CREATE INDEX "joints_part_id_index" ON "joints" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "joints_needed_part_id_index" ON "joints" USING btree ("needed_part_id");--> statement-breakpoint
CREATE INDEX "parts_concept_id_type_index" ON "parts" USING btree ("concept_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "parts_measure_source_unique" ON "parts" USING btree ("project_id","source") WHERE "parts"."type" = 'insight' and "parts"."source" like 'mock-analytics://%';--> statement-breakpoint
-- A new table has no grants. The CI role gets on each table of the Part model
-- the rights it has on "projects".
DO $$
DECLARE
	granted record;
	part_table text;
BEGIN
	FOR granted IN
		SELECT grantee, privilege_type
		FROM information_schema.table_privileges
		WHERE table_schema = 'public' AND table_name = 'projects' AND grantee = 'glue_ci'
	LOOP
		FOREACH part_table IN ARRAY ARRAY['concepts', 'parts', 'joints', 'measures', 'part_counters']
		LOOP
			EXECUTE format('GRANT %s ON %I TO %I', granted.privilege_type, part_table, granted.grantee);
		END LOOP;
	END LOOP;
END $$;