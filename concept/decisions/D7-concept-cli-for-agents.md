---
id: D7
title: Agents read and add Concept records with pnpm concept, a CLI on the database, until the app has an API
date: 2026-09-29
owner: Orchestrator
status: accepted
goal: G1
evidence:
  - F5
---

The CLI checks what `scripts/check-concept.mjs` checks today: required fields, id format, and that a Decision's Goal and evidence exist. Then `concept/` is removed.
