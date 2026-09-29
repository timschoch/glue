CREATE TABLE "decision_evidence" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "decision_evidence_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"decision_id" integer NOT NULL,
	"insight_id" integer,
	"fact_id" integer,
	CONSTRAINT "decision_evidence_decision_id_insight_id_fact_id_unique" UNIQUE("decision_id","insight_id","fact_id"),
	CONSTRAINT "decision_evidence_exactly_one_check" CHECK (num_nonnulls("decision_evidence"."insight_id", "decision_evidence"."fact_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "decisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"record_id" text NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"owner" text NOT NULL,
	"status" text NOT NULL,
	"goal_id" integer NOT NULL,
	"superseded_by_id" integer,
	"body" text DEFAULT '' NOT NULL,
	CONSTRAINT "decisions_product_id_record_id_unique" UNIQUE("product_id","record_id"),
	CONSTRAINT "decisions_status_check" CHECK ("decisions"."status" in ('proposed', 'accepted', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "facts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"record_id" text NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	CONSTRAINT "facts_product_id_record_id_unique" UNIQUE("product_id","record_id")
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "goals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"record_id" text NOT NULL,
	"title" text NOT NULL,
	"metric" text NOT NULL,
	"source" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	CONSTRAINT "goals_product_id_record_id_unique" UNIQUE("product_id","record_id")
);
--> statement-breakpoint
CREATE TABLE "guardrails" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "guardrails_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"record_id" text NOT NULL,
	"title" text NOT NULL,
	"enforced_by" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	CONSTRAINT "guardrails_product_id_record_id_unique" UNIQUE("product_id","record_id")
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "insights_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"record_id" text NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"source" text NOT NULL,
	"status" text,
	"body" text DEFAULT '' NOT NULL,
	CONSTRAINT "insights_product_id_record_id_unique" UNIQUE("product_id","record_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "decision_evidence" ADD CONSTRAINT "decision_evidence_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_evidence" ADD CONSTRAINT "decision_evidence_insight_id_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."insights"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_evidence" ADD CONSTRAINT "decision_evidence_fact_id_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."facts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_superseded_by_id_decisions_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardrails" ADD CONSTRAINT "guardrails_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;