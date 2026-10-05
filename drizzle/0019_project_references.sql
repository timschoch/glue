CREATE TABLE "project_references" (
	"project_id" integer NOT NULL,
	"referenced_project_id" integer NOT NULL,
	CONSTRAINT "project_references_project_id_referenced_project_id_pk" PRIMARY KEY("project_id","referenced_project_id"),
	CONSTRAINT "project_references_projects_differ_check" CHECK ("project_references"."project_id" <> "project_references"."referenced_project_id")
);
--> statement-breakpoint
ALTER TABLE "project_references" ADD CONSTRAINT "project_references_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_references" ADD CONSTRAINT "project_references_referenced_project_id_projects_id_fk" FOREIGN KEY ("referenced_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;