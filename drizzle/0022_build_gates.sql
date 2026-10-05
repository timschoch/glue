CREATE TABLE "build_gates" (
	"project_id" integer NOT NULL,
	"number" integer NOT NULL,
	"result" text NOT NULL,
	"reasons" jsonb NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "build_gates_project_id_number_pk" PRIMARY KEY("project_id","number")
);
--> statement-breakpoint
ALTER TABLE "build_gates" ADD CONSTRAINT "build_gates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;