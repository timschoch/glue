CREATE TABLE "assignments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assignments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"member_id" integer NOT NULL,
	"concept_id" integer,
	"part_id" integer,
	"role" text NOT NULL,
	CONSTRAINT "assignments_member_id_concept_id_part_id_unique" UNIQUE NULLS NOT DISTINCT("member_id","concept_id","part_id"),
	CONSTRAINT "assignments_one_target_check" CHECK (num_nonnulls("assignments"."concept_id", "assignments"."part_id") = 1),
	CONSTRAINT "assignments_role_check" CHECK ("assignments"."role" in ('responsible', 'co-author'))
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "members_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"loop_steps" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "members_project_id_user_id_unique" UNIQUE("project_id","user_id"),
	CONSTRAINT "members_loop_steps_check" CHECK ("members"."loop_steps" <@ array['understand', 'decide', 'design', 'build', 'use'])
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_part_id_index" ON "assignments" USING btree ("part_id");--> statement-breakpoint
-- Each account of today is a member of each Project of today. A database
-- without Neon Auth has no accounts.
DO $$
BEGIN
	IF to_regclass('neon_auth.user') IS NOT NULL THEN
		INSERT INTO "members" ("project_id", "user_id", "name", "email")
		SELECT "projects"."id", "user"."id"::text, "user"."name", "user"."email"
		FROM "projects" CROSS JOIN "neon_auth"."user" AS "user";
	END IF;
END $$;
