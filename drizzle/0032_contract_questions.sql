CREATE TABLE "contract_questions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contract_questions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"concept_id" integer NOT NULL,
	"version" integer NOT NULL,
	"text" text NOT NULL,
	"asked_by" text NOT NULL,
	"asked_at" timestamp with time zone NOT NULL,
	"answer" text,
	"answered_by" text,
	"answered_at" timestamp with time zone,
	CONSTRAINT "contract_questions_answer_check" CHECK (num_nonnulls("contract_questions"."answer", "contract_questions"."answered_by", "contract_questions"."answered_at") in (0, 3))
);
--> statement-breakpoint
ALTER TABLE "contract_questions" ADD CONSTRAINT "contract_questions_concept_id_version_contract_versions_concept_id_version_fk" FOREIGN KEY ("concept_id","version") REFERENCES "public"."contract_versions"("concept_id","version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_questions_concept_id_index" ON "contract_questions" USING btree ("concept_id");