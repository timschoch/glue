-- The Responsible member is the owner of a Part (glue-build/D56). A Part
-- with no Responsible gets the member of its Project whose name is the old
-- owner, without case. Two members with that name: the first one. The
-- migration only adds rows, and it keeps the column "owner".
INSERT INTO "assignments" ("member_id", "part_id", "role")
SELECT DISTINCT ON ("parts"."id") "members"."id", "parts"."id", 'responsible'
FROM "parts"
INNER JOIN "members"
	ON "members"."project_id" = "parts"."project_id"
	AND lower("members"."name") = lower(trim("parts"."owner"))
WHERE NOT EXISTS (
	SELECT 1 FROM "assignments"
	WHERE "assignments"."part_id" = "parts"."id"
		AND "assignments"."role" = 'responsible'
)
ORDER BY "parts"."id", "members"."id"
ON CONFLICT DO NOTHING;