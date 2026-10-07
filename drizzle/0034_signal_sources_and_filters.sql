CREATE TABLE "signal_filters" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "signal_filters_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"must_hold" jsonb NOT NULL,
	"must_not_hold" jsonb NOT NULL,
	"sources" jsonb NOT NULL,
	CONSTRAINT "signal_filters_project_id_name_unique" UNIQUE("project_id","name")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "market_url" text;--> statement-breakpoint
ALTER TABLE "signal_filters" ADD CONSTRAINT "signal_filters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;