CREATE TABLE "watchers" (
	"part_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	CONSTRAINT "watchers_part_id_member_id_pk" PRIMARY KEY("part_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "watchers" ADD CONSTRAINT "watchers_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchers" ADD CONSTRAINT "watchers_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watchers_member_id_index" ON "watchers" USING btree ("member_id");