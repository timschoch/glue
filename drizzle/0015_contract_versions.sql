CREATE TABLE "contract_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contract_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"concept_id" integer NOT NULL,
	"version" integer NOT NULL,
	"checksum" text NOT NULL,
	"parts" jsonb NOT NULL,
	"signed_by" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_versions_concept_id_version_unique" UNIQUE("concept_id","version")
);
--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;