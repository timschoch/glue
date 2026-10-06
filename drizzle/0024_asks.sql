CREATE TABLE "asks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "asks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"part_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"picked_by_id" integer,
	"handed_back_part_id" integer,
	"asked_at" timestamp with time zone NOT NULL,
	"picked_at" timestamp with time zone,
	"handed_back_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "asks" ADD CONSTRAINT "asks_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asks" ADD CONSTRAINT "asks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asks" ADD CONSTRAINT "asks_picked_by_id_members_id_fk" FOREIGN KEY ("picked_by_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asks" ADD CONSTRAINT "asks_handed_back_part_id_parts_id_fk" FOREIGN KEY ("handed_back_part_id") REFERENCES "public"."parts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asks_part_id_index" ON "asks" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "asks_project_id_index" ON "asks" USING btree ("project_id");