CREATE TABLE "part_activity" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "part_activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"part_id" integer NOT NULL,
	"kind" text NOT NULL,
	"version" integer,
	"member_id" integer,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "part_activity_kind_check" CHECK ("part_activity"."kind" in ('to-check', 'waiting', 'draft', 'review', 'published', 'sunk', 'changed', 'wording'))
);
--> statement-breakpoint
CREATE TABLE "part_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "part_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"part_id" integer NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"fields" jsonb NOT NULL,
	"member_id" integer,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "part_versions_part_id_version_unique" UNIQUE("part_id","version")
);
--> statement-breakpoint
ALTER TABLE "part_activity" ADD CONSTRAINT "part_activity_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_activity" ADD CONSTRAINT "part_activity_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_versions" ADD CONSTRAINT "part_versions_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_versions" ADD CONSTRAINT "part_versions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "part_activity_part_id_index" ON "part_activity" USING btree ("part_id");--> statement-breakpoint
-- A Part from before this migration gets the lines that its dates give: its
-- first sign-off, its last wording fix and its last change. No member: the
-- dates name none. A change at the time of another line, or of a flag, is
-- that line. Such a Part has no Part Version: nothing kept its text.
INSERT INTO "part_activity" ("part_id", "kind", "at")
SELECT "id", 'published', "published_at" FROM "parts"
WHERE "published_at" IS NOT NULL
UNION ALL
SELECT "id", 'wording', "wording_at" FROM "parts"
WHERE "wording_at" IS NOT NULL
UNION ALL
SELECT "id", 'changed', "changed_at" FROM "parts"
WHERE "changed_at" IS DISTINCT FROM "published_at"
	AND "changed_at" IS DISTINCT FROM "wording_at"
	AND NOT EXISTS (
		SELECT 1 FROM "flags"
		WHERE "flags"."part_id" = "parts"."id"
			AND "parts"."changed_at" IN ("flags"."created_at", "flags"."closed_at")
	)
ORDER BY 3, 1;