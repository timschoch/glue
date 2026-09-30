DELETE FROM "decision_evidence" a USING "decision_evidence" b
	WHERE a.id > b.id
	AND a.decision_id = b.decision_id
	AND a.insight_id IS NOT DISTINCT FROM b.insight_id
	AND a.fact_id IS NOT DISTINCT FROM b.fact_id;--> statement-breakpoint
ALTER TABLE "decision_evidence" DROP CONSTRAINT "decision_evidence_decision_id_insight_id_fact_id_unique";--> statement-breakpoint
ALTER TABLE "decision_evidence" ADD CONSTRAINT "decision_evidence_decision_id_insight_id_fact_id_unique" UNIQUE NULLS NOT DISTINCT("decision_id","insight_id","fact_id");