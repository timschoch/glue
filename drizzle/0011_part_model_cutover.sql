-- The cutover to the Part model (D25, D26, D35, D38).
-- The old tables stay for the code from before this migration: it can read
-- them, it cannot write them. Ticket 135 drops them.

CREATE FUNCTION "refuse_old_record_write"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'table "%" is read-only: the Part model holds the records now', TG_TABLE_NAME;
END $$;
--> statement-breakpoint
-- The triggers come before the copy. To create a trigger locks the table, so
-- no write gets in between the copy and the trigger. A trigger refuses each
-- row, so a statement that touches no row passes.
DO $$
DECLARE
	old_table text;
BEGIN
	FOREACH old_table IN ARRAY ARRAY['goals', 'decisions', 'insights', 'facts', 'guardrails', 'decision_evidence', 'record_counters']
	LOOP
		EXECUTE format(
			'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION "refuse_old_record_write"()',
			old_table || '_read_only',
			old_table
		);
	END LOOP;
END $$;
--> statement-breakpoint
DO $$
DECLARE
	bad_ids text;
	fact record;
BEGIN
	IF EXISTS (SELECT FROM "parts") THEN
		RAISE EXCEPTION 'cutover: "parts" already has rows';
	END IF;

	-- The id of a Part is the letter of its type and a number.
	SELECT string_agg(format('record id "%s" of %s', r."record_id", p."slug"), ', ')
	INTO bad_ids
	FROM (
		SELECT "product_id", "record_id", 'G' AS letter FROM "goals"
		UNION ALL SELECT "product_id", "record_id", 'D' FROM "decisions"
		UNION ALL SELECT "product_id", "record_id", 'I' FROM "insights"
		UNION ALL SELECT "product_id", "record_id", 'F' FROM "facts"
		UNION ALL SELECT "product_id", "record_id", 'R' FROM "guardrails"
	) r
	JOIN "projects" p ON p."id" = r."product_id"
	WHERE r."record_id" !~ ('^' || r.letter || '[0-9]+$');
	IF bad_ids IS NOT NULL THEN
		RAISE EXCEPTION 'cutover: not the letter of its type and a number: %', bad_ids;
	END IF;

	-- One root Concept per Project. It holds all Parts of the Project.
	INSERT INTO "concepts" ("project_id", "slug", "title")
	SELECT p."id", p."slug", p."name"
	FROM "projects" p
	WHERE NOT EXISTS (
		SELECT FROM "concepts" c WHERE c."project_id" = p."id" AND c."parent_id" IS NULL
	)
	ORDER BY p."id";

	INSERT INTO "parts" ("project_id", "concept_id", "type", "record_id", "title", "body", "status", "source", "metric")
	SELECT g."product_id", c."id", 'goal', g."record_id", g."title", g."body", g."status", g."source", g."metric"
	FROM "goals" g
	JOIN "concepts" c ON c."project_id" = g."product_id" AND c."parent_id" IS NULL
	ORDER BY g."id";

	INSERT INTO "measures" ("part_id", "measure", "baseline", "latest_value", "latest_breakdown_value", "measured_at")
	SELECT p."id", g."measure", g."baseline", g."latest_value", g."latest_breakdown_value", g."measured_at"
	FROM "goals" g
	JOIN "parts" p ON p."project_id" = g."product_id" AND p."record_id" = g."record_id"
	WHERE g."measure" IS NOT NULL AND g."measure" <> 'null'::jsonb
	ORDER BY g."id";

	INSERT INTO "parts" ("project_id", "concept_id", "type", "record_id", "title", "body", "status", "date", "source")
	SELECT i."product_id", c."id", 'insight', i."record_id", i."title", i."body", i."status", i."date", i."source"
	FROM "insights" i
	JOIN "concepts" c ON c."project_id" = i."product_id" AND c."parent_id" IS NULL
	ORDER BY i."id";

	INSERT INTO "parts" ("project_id", "concept_id", "type", "record_id", "title", "body", "enforced_by")
	SELECT r."product_id", c."id", 'guardrail', r."record_id", r."title", r."body", r."enforced_by"
	FROM "guardrails" r
	JOIN "concepts" c ON c."project_id" = r."product_id" AND c."parent_id" IS NULL
	ORDER BY r."id";

	INSERT INTO "parts" ("project_id", "concept_id", "type", "record_id", "title", "body", "status", "date", "owner", "issue_url")
	SELECT d."product_id", c."id", 'decision', d."record_id", d."title", d."body", d."status", d."date", d."owner", d."issue_url"
	FROM "decisions" d
	JOIN "concepts" c ON c."project_id" = d."product_id" AND c."parent_id" IS NULL
	ORDER BY d."id";

	UPDATE "parts" p
	SET "superseded_by_id" = successor_part."id"
	FROM "decisions" d
	JOIN "decisions" successor ON successor."id" = d."superseded_by_id"
	JOIN "parts" successor_part
		ON successor_part."project_id" = successor."product_id" AND successor_part."record_id" = successor."record_id"
	WHERE p."project_id" = d."product_id" AND p."record_id" = d."record_id";

	-- A counter starts at the highest number its type had: the old counter or
	-- the highest id, whichever is higher. A folder is its type plus "s".
	INSERT INTO "part_counters" ("project_id", "type", "last_number")
	SELECT n."project_id", n."type", max(n."number")
	FROM (
		SELECT "project_id", "type", substring("record_id" from 2)::integer AS "number" FROM "parts"
		UNION ALL
		SELECT "product_id", left("folder", -1), "last_number" FROM "record_counters" WHERE "folder" <> 'facts'
	) n
	GROUP BY n."project_id", n."type";

	-- Fact is no longer a type (D26). D35 lists the Facts that become a
	-- Guardrail or a Hunch. Each other Fact becomes a Confirmed Insight.
	-- The new id is the next one of the new type, in Fact number order.
	CREATE TEMP TABLE "fact_parts" ON COMMIT DROP AS
	SELECT
		f."id" AS "fact_id",
		f."product_id" AS "project_id",
		f."record_id" AS "fact_record_id",
		fate."type",
		fate."enforced_by",
		fate."evidence_level",
		CASE fate."type" WHEN 'insight' THEN 'I' ELSE 'R' END
			|| coalesce(counter."last_number", 0) + row_number() OVER (
				PARTITION BY f."product_id", fate."type"
				ORDER BY substring(f."record_id" from 2)::integer
			) AS "record_id"
	FROM "facts" f
	JOIN "projects" p ON p."id" = f."product_id"
	LEFT JOIN (
		VALUES
			('glue', 'F2', 'the merge gate and pnpm collect-insights', NULL),
			('flexibeck', 'F2', 'not enforced yet', NULL),
			('flexibeck', 'F5', 'not enforced yet', NULL),
			('flexibeck', 'F9', 'not enforced yet', NULL),
			('flexibeck', 'F10', NULL, 'hunch')
	) listed ("slug", "record_id", "enforced_by", "evidence_level")
		ON listed."slug" = p."slug" AND listed."record_id" = f."record_id"
	CROSS JOIN LATERAL (
		SELECT
			CASE WHEN listed."enforced_by" IS NULL THEN 'insight' ELSE 'guardrail' END AS "type",
			listed."enforced_by",
			CASE WHEN listed."enforced_by" IS NULL THEN coalesce(listed."evidence_level", 'confirmed') END AS "evidence_level"
	) fate
	LEFT JOIN "part_counters" counter ON counter."project_id" = f."product_id" AND counter."type" = fate."type";

	-- A Fact has no date. The Insight gets the day of the cutover.
	INSERT INTO "parts" ("project_id", "concept_id", "type", "record_id", "title", "body", "date", "source", "enforced_by", "evidence_level")
	SELECT
		m."project_id", c."id", m."type", m."record_id", f."title", f."body",
		CASE m."type" WHEN 'insight' THEN (now() AT TIME ZONE 'UTC')::date END,
		f."source", m."enforced_by", m."evidence_level"
	FROM "fact_parts" m
	JOIN "facts" f ON f."id" = m."fact_id"
	JOIN "concepts" c ON c."project_id" = m."project_id" AND c."parent_id" IS NULL
	ORDER BY m."project_id", substring(m."fact_record_id" from 2)::integer;

	INSERT INTO "part_counters" ("project_id", "type", "last_number")
	SELECT "project_id", "type", max(substring("record_id" from 2)::integer)
	FROM "fact_parts"
	GROUP BY "project_id", "type"
	ON CONFLICT ("project_id", "type") DO UPDATE SET "last_number" = excluded."last_number";

	-- The order of the Joint ids is the order of the evidence. Per Decision:
	-- the Goal first, then the evidence in its old order.
	INSERT INTO "joints" ("part_id", "needed_part_id")
	SELECT j."part_id", j."needed_part_id"
	FROM (
		SELECT d."id" AS "decision_id", 0 AS "position", decision_part."id" AS "part_id", goal_part."id" AS "needed_part_id"
		FROM "decisions" d
		JOIN "goals" g ON g."id" = d."goal_id"
		JOIN "parts" decision_part ON decision_part."project_id" = d."product_id" AND decision_part."record_id" = d."record_id"
		JOIN "parts" goal_part ON goal_part."project_id" = g."product_id" AND goal_part."record_id" = g."record_id"
		UNION ALL
		SELECT d."id", e."id", decision_part."id", evidence_part."id"
		FROM "decision_evidence" e
		JOIN "decisions" d ON d."id" = e."decision_id"
		JOIN "parts" decision_part ON decision_part."project_id" = d."product_id" AND decision_part."record_id" = d."record_id"
		LEFT JOIN "insights" i ON i."id" = e."insight_id"
		LEFT JOIN "fact_parts" m ON m."fact_id" = e."fact_id"
		JOIN "parts" evidence_part
			ON evidence_part."project_id" = coalesce(i."product_id", m."project_id")
			AND evidence_part."record_id" = coalesce(i."record_id", m."record_id")
	) j
	ORDER BY j."decision_id", j."position";

	-- A body that names an old Fact id names the new id.
	FOR fact IN SELECT * FROM "fact_parts"
	LOOP
		UPDATE "parts"
		SET "body" = regexp_replace("body", '\m' || fact."fact_record_id" || '\M', fact."record_id", 'g')
		WHERE "project_id" = fact."project_id" AND "body" ~ ('\m' || fact."fact_record_id" || '\M');
	END LOOP;
END $$;