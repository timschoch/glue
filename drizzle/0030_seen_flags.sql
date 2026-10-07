CREATE TABLE "seen_flags" (
	"flag_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	CONSTRAINT "seen_flags_flag_id_member_id_pk" PRIMARY KEY("flag_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "seen_flags" ADD CONSTRAINT "seen_flags_flag_id_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen_flags" ADD CONSTRAINT "seen_flags_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seen_flags_member_id_index" ON "seen_flags" USING btree ("member_id");