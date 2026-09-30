CREATE TABLE "record_counters" (
	"product_id" integer NOT NULL,
	"folder" text NOT NULL,
	"last_number" integer NOT NULL,
	CONSTRAINT "record_counters_product_id_folder_pk" PRIMARY KEY("product_id","folder")
);
--> statement-breakpoint
ALTER TABLE "record_counters" ADD CONSTRAINT "record_counters_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Each counter starts at the highest number that its folder has now.
INSERT INTO "record_counters" ("product_id", "folder", "last_number")
SELECT "product_id", "folder", max(substring("record_id" from 2)::integer)
FROM (
	SELECT "product_id", 'goals' AS "folder", "record_id" FROM "goals"
	UNION ALL SELECT "product_id", 'decisions', "record_id" FROM "decisions"
	UNION ALL SELECT "product_id", 'insights', "record_id" FROM "insights"
	UNION ALL SELECT "product_id", 'facts', "record_id" FROM "facts"
	UNION ALL SELECT "product_id", 'guardrails', "record_id" FROM "guardrails"
) AS "records"
WHERE "record_id" ~ '^[A-Z][0-9]+$'
GROUP BY "product_id", "folder";