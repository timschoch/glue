---
name: drizzle-cli
description: Run Drizzle schema migrations with drizzle-kit — generate, migrate, push, check, studio. Use when the Drizzle schema or its migrations change. Not for writing queries or app code.
---

# Drizzle CLI

Schema changes go through `drizzle-kit`, never through hand-written SQL migrations.

- Generate a migration from schema changes: `drizzle-kit generate`
- Apply migrations: `drizzle-kit migrate`
- Push schema directly (dev only): `drizzle-kit push`
- Inspect the DB in a UI: `drizzle-kit studio`
- Sanity-check schema vs migrations: `drizzle-kit check`
- Discover more: `drizzle-kit --help`

Config lives in `drizzle.config.ts`. Check the repo's npm scripts first — migrations are often wired into the build.

For current Drizzle documentation, use the `context7` skill — there is no vendor docs skill for Drizzle yet.
