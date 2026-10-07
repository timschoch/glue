CREATE TABLE "kind_slots" (
	"kind_id" integer NOT NULL,
	"type" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"tier" integer NOT NULL,
	"min_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "kind_slots_kind_id_type_pk" PRIMARY KEY("kind_id","type"),
	CONSTRAINT "kind_slots_type_check" CHECK ("kind_slots"."type" in ('insight', 'goal', 'decision', 'guardrail', 'entity', 'flow', 'metric')),
	CONSTRAINT "kind_slots_tier_check" CHECK ("kind_slots"."tier" in (1, 2)),
	CONSTRAINT "kind_slots_min_count_check" CHECK ("kind_slots"."min_count" >= 1)
);
--> statement-breakpoint
CREATE TABLE "kinds" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kinds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "kinds_project_id_slug_unique" UNIQUE("project_id","slug"),
	CONSTRAINT "kinds_project_id_id_unique" UNIQUE("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN "kind_id" integer;--> statement-breakpoint
ALTER TABLE "kind_slots" ADD CONSTRAINT "kind_slots_kind_id_kinds_id_fk" FOREIGN KEY ("kind_id") REFERENCES "public"."kinds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kinds" ADD CONSTRAINT "kinds_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_project_id_kind_id_kinds_project_id_id_fk" FOREIGN KEY ("project_id","kind_id") REFERENCES "public"."kinds"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Each Project gets the Kind Brief with the slots that the code had: one
-- required slot per Part type, with one Part or more.
INSERT INTO "kinds" ("project_id", "slug", "name")
SELECT "id", 'brief', 'Brief' FROM "projects";--> statement-breakpoint
INSERT INTO "kind_slots" ("kind_id", "type", "tier")
SELECT "kinds"."id", slot."type", slot."tier"
FROM "kinds"
CROSS JOIN (
	VALUES
		('insight', 2),
		('goal', 2),
		('decision', 2),
		('metric', 2),
		('flow', 1),
		('entity', 1),
		('guardrail', 1)
) AS slot ("type", "tier");--> statement-breakpoint
-- A Concept names its Kind by the row. The column "kind" stays as it is.
UPDATE "concepts" SET "kind_id" = "kinds"."id"
FROM "kinds"
WHERE "kinds"."project_id" = "concepts"."project_id"
	AND "kinds"."slug" = "concepts"."kind";
