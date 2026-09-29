---
name: neon
type: tech
activation: "neon neonctl branch database-branch PROD_DATABASE_URL STAGING_DATABASE_URL connection-pooling serverless"
---

# Neon Critic

## What to check

- **Branch strategy**: does the plan create or destroy database branches correctly? Is it
  using the right branch (main/production vs staging vs feature branch)?
- **Connection pooling**: Neon with serverless Next.js — is `@neondatabase/serverless` or
  the pooled connection string used instead of a direct connection? Direct connections
  exhaust the connection limit quickly in serverless environments.
- **Migration workflow**: are schema migrations run against the correct branch before
  promoting? Is the branch promotion step in the plan?
- **Environment variable naming**: `PROD_DATABASE_URL`, `STAGING_DATABASE_URL` — are the
  right vars used per environment? No accidental cross-environment writes.
- **Branch cleanup**: temporary feature branches — is there a cleanup step in the plan?

## Sources

- Context7: resolve `neon` or `neondatabase` → query for connection pooling, branch workflow,
  serverless best practices
