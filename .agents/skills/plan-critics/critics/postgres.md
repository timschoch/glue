---
name: postgres
type: tech
activation: "migration schema query index join transaction sql drizzle database db table column constraint foreign-key"
standalone-skill: postgres-best-practices
---

# PostgreSQL Critic

## What to check

- **Missing `down` migration**: every schema migration should have a `down` path. If the
  change is truly irreversible, it must be explicitly documented as such in the plan.
- **Missing indexes**: new foreign keys without indexes; columns that will be filtered or
  sorted on without indexes; composite index column order
- **N+1 query risk**: loading a list of records and then querying related data per record
  in a loop — should use JOIN or `populate` at query time
- **Transaction safety**: multi-step writes that should be atomic — are they wrapped in a
  transaction? What's the rollback behaviour on partial failure?
- **Constraint naming**: constraints named descriptively (not auto-generated) for clarity
  in migration errors
- **Column type choices**: `text` vs `varchar`, `int` vs `bigint`, `timestamp` vs
  `timestamptz` — is the right type used for the data?
- **NULL handling**: columns that should not be null — is `NOT NULL` enforced at DB level,
  not just application level?
- **Migration lock risk**: adding `NOT NULL` columns to large tables without a default, or
  adding indexes without `CONCURRENTLY` — will this lock the table?
- **Drizzle schema sync**: if using Drizzle ORM, does the plan update the schema file and
  generate the migration, not hand-write SQL?

## Sources

- Standalone skill `postgres-best-practices`: load its SKILL.md for Postgres performance,
  schema, and query guidelines
