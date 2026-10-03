ALTER TABLE "products" RENAME TO "projects";--> statement-breakpoint
ALTER SEQUENCE "products_id_seq" RENAME TO "projects_id_seq";--> statement-breakpoint
ALTER INDEX "products_pkey" RENAME TO "projects_pkey";--> statement-breakpoint
ALTER TABLE "projects" RENAME CONSTRAINT "products_slug_unique" TO "projects_slug_unique";--> statement-breakpoint
ALTER TABLE "tokens" RENAME COLUMN "product_id" TO "project_id";--> statement-breakpoint
ALTER TABLE "tokens" RENAME CONSTRAINT "tokens_product_id_products_id_fk" TO "tokens_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "decisions" RENAME CONSTRAINT "decisions_product_id_products_id_fk" TO "decisions_product_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "facts" RENAME CONSTRAINT "facts_product_id_products_id_fk" TO "facts_product_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "goals" RENAME CONSTRAINT "goals_product_id_products_id_fk" TO "goals_product_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "guardrails" RENAME CONSTRAINT "guardrails_product_id_products_id_fk" TO "guardrails_product_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "insights" RENAME CONSTRAINT "insights_product_id_products_id_fk" TO "insights_product_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "record_counters" RENAME CONSTRAINT "record_counters_product_id_products_id_fk" TO "record_counters_product_id_projects_id_fk";--> statement-breakpoint
-- The old names stay for the code that ran before this migration. The
-- migration that ends the Part model cutover drops them.
CREATE VIEW "products" AS SELECT * FROM "projects";--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "product_id" integer GENERATED ALWAYS AS ("project_id") STORED;--> statement-breakpoint
-- A role keeps its rights on a renamed table. The view is new, so the CI role
-- gets on it the rights it has on "projects".
DO $$
DECLARE
	granted record;
BEGIN
	FOR granted IN
		SELECT grantee, privilege_type
		FROM information_schema.table_privileges
		WHERE table_schema = 'public' AND table_name = 'projects' AND grantee = 'glue_ci'
	LOOP
		EXECUTE format('GRANT %s ON "products" TO %I', granted.privilege_type, granted.grantee);
	END LOOP;
END $$;
