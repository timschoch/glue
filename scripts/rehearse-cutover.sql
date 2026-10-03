-- The rehearsal of the cutover to the Part model (ticket 132).
-- Run it on a copy of the database, after drizzle/0011_part_model_cutover.sql
-- and before the first write of the new code:
--   psql "$COPY_DATABASE_URL" -f scripts/rehearse-cutover.sql
-- Each check only reads. It returns rows only when something is wrong, and
-- the column "label" says what.

-- 1. Each Project has the same number of rows per type in the old tables and
-- in "parts". D35 names the Facts that became Guardrails. Each other Fact
-- became an Insight.
WITH fact_guardrails (slug, record_id) AS (
	VALUES ('glue', 'F2'), ('flexibeck', 'F2'), ('flexibeck', 'F5'), ('flexibeck', 'F9')
),
old_rows AS (
	SELECT "product_id" AS project_id, 'goal' AS type FROM "goals"
	UNION ALL SELECT "product_id", 'decision' FROM "decisions"
	UNION ALL SELECT "product_id", 'insight' FROM "insights"
	UNION ALL SELECT "product_id", 'guardrail' FROM "guardrails"
	UNION ALL
	SELECT f."product_id", CASE WHEN g.record_id IS NULL THEN 'insight' ELSE 'guardrail' END
	FROM "facts" f
	JOIN "projects" p ON p."id" = f."product_id"
	LEFT JOIN fact_guardrails g ON g.slug = p."slug" AND g.record_id = f."record_id"
),
old_counts AS (
	SELECT project_id, type, count(*) AS row_count FROM old_rows GROUP BY project_id, type
),
part_counts AS (
	SELECT "project_id" AS project_id, "type"::text AS type, count(*) AS row_count
	FROM "parts" GROUP BY "project_id", "type"
)
SELECT
	'the row count of a type differs' AS label,
	p."slug" AS project,
	coalesce(o.type, n.type) AS type,
	coalesce(o.row_count, 0) AS old_rows,
	coalesce(n.row_count, 0) AS parts
FROM old_counts o
FULL JOIN part_counts n USING (project_id, type)
JOIN "projects" p ON p."id" = coalesce(o.project_id, n.project_id)
WHERE o.row_count IS DISTINCT FROM n.row_count
ORDER BY project, type;

-- 2. Each Decision has the Joint to its Goal.
SELECT
	'a Decision has no Joint to its Goal' AS label,
	p."slug" AS project,
	d."record_id" AS decision,
	g."record_id" AS goal
FROM "decisions" d
JOIN "goals" g ON g."id" = d."goal_id"
JOIN "projects" p ON p."id" = d."product_id"
WHERE NOT EXISTS (
	SELECT FROM "joints" j
	JOIN "parts" part ON part."id" = j."part_id"
	JOIN "parts" needed ON needed."id" = j."needed_part_id"
	WHERE part."project_id" = d."product_id"
		AND part."type" = 'decision'
		AND part."record_id" = d."record_id"
		AND needed."type" = 'goal'
		AND needed."record_id" = g."record_id"
)
ORDER BY project, decision;

-- 3. Each Decision has its evidence Joints in the old order. A Fact has a new
-- id, so the check compares the titles.
WITH old_evidence AS (
	SELECT
		d."product_id" AS project_id,
		d."record_id" AS decision,
		array_agg(coalesce(i."title", f."title") ORDER BY e."id") AS titles
	FROM "decisions" d
	JOIN "decision_evidence" e ON e."decision_id" = d."id"
	LEFT JOIN "insights" i ON i."id" = e."insight_id"
	LEFT JOIN "facts" f ON f."id" = e."fact_id"
	GROUP BY d."product_id", d."record_id"
),
new_evidence AS (
	SELECT
		part."project_id" AS project_id,
		part."record_id" AS decision,
		array_agg(needed."title" ORDER BY j."id") AS titles
	FROM "parts" part
	JOIN "joints" j ON j."part_id" = part."id"
	JOIN "parts" needed ON needed."id" = j."needed_part_id"
	WHERE part."type" = 'decision' AND needed."type" <> 'goal'
	GROUP BY part."project_id", part."record_id"
)
SELECT
	'the evidence of a Decision differs' AS label,
	p."slug" AS project,
	decision,
	o.titles AS old_evidence,
	n.titles AS joints
FROM old_evidence o
FULL JOIN new_evidence n USING (project_id, decision)
JOIN "projects" p ON p."id" = project_id
WHERE o.titles IS DISTINCT FROM n.titles
ORDER BY project, decision;

-- 4. No Part body names the old id of a Fact of its Project.
SELECT
	'a body names the old id of a Fact' AS label,
	p."slug" AS project,
	part."record_id" AS part,
	f."record_id" AS fact
FROM "parts" part
JOIN "facts" f
	ON f."product_id" = part."project_id"
	AND part."body" ~ ('\m' || f."record_id" || '\M')
JOIN "projects" p ON p."id" = part."project_id"
ORDER BY project, part, fact;

-- 5. Each counter is at or above the highest number of its type.
SELECT
	'a counter is below the highest number of its type' AS label,
	p."slug" AS project,
	highest.type,
	highest.number AS highest_number,
	c."last_number" AS counter
FROM (
	SELECT
		"project_id" AS project_id,
		"type" AS type,
		max(substring("record_id" FROM 2)::integer) AS number
	FROM "parts"
	GROUP BY "project_id", "type"
) highest
JOIN "projects" p ON p."id" = highest.project_id
LEFT JOIN "part_counters" c
	ON c."project_id" = highest.project_id AND c."type" = highest.type
WHERE c."last_number" IS NULL OR c."last_number" < highest.number
ORDER BY project, type;
