ALTER TABLE "goals" ADD COLUMN "measure" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "analytics_project" text;--> statement-breakpoint
CREATE UNIQUE INDEX "insights_measure_source_unique" ON "insights" USING btree ("product_id","source") WHERE "insights"."source" like 'mock-analytics://%';