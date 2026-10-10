CREATE TABLE "integrations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "integrations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"tool" text NOT NULL,
	"address" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"key_last_four" text NOT NULL,
	"state" text NOT NULL,
	"last_read_at" timestamp with time zone,
	"last_read_signal_count" integer,
	"last_read_error" text,
	CONSTRAINT "integrations_project_id_tool_address_unique" UNIQUE("project_id","tool","address"),
	CONSTRAINT "integrations_state_check" CHECK ("integrations"."state" in ('active', 'paused', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;