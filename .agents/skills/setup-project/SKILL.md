---
name: setup-project
description: >
  Main entry point when starting work in a new repo, right after `skilly setup`.
  Drives the workflow setup skills in order, then the tech-stack bundles.
  Use when the user wants to set up a new project or repo.
---

# Setup project

Drives the setup flows in [flows user.mmd](https://github.com/timschoch/skilly/blob/main/docs/flows%20user.mmd): workflow setup first, tech stack second.

Setup skills are just-in-time: `npx github:timschoch/skilly add <skill>`, then READ the installed SKILL.md and follow it directly (the session's skill list only loads at startup — no reload exists), then `npx github:timschoch/skilly remove <skill>`. This applies to EVERY skill named below — never invoke a copy installed elsewhere on the machine. Setup skills live in NO synced bundle: they would sit unused and pollute the context window.

## Workflow setup

Ask which parts apply, then run the chosen skills in this order, finishing one before the next:

1. Husky + lint-staged + Prettier pre-commit? → `setup-pre-commit`; the repo's own stack → skip (nothing automated for it yet — add a sibling skill when one earns its place).
2. GitHub scaffolding (conventional commits/branches)? → `setup-repo` — GitHub settings, commit/branch rules wired into the hooks just chosen, `CLAUDE.md` scaffold.
3. Release automation? → `setup-release-please` — plus merge settings.
4. Wayfinder? → `setup-matt-pocock-skills` — issue tracker, triage labels, domain-doc layout.
5. GDD (God-driven development: prayer before working)? → `npx github:timschoch/skilly add gdd`, then `node .claude/skills/gdd/scripts/setup.mjs`.

Remove the used setup skills, commit conventionally, push, and make sure a PR exists.

## Tech stack

1. Propose Bundles from the [catalog](https://github.com/timschoch/skilly/blob/main/docs/bundles.md), let the user confirm:
   - every repo: `workflow`
   - a `project-<x>` bundle when one exists (it already includes its tech bundles)
   - otherwise the `tech-*` bundles matching the stack (check `package.json` / lockfiles)
   - `marketing` only where the repo produces marketing content
2. `npx github:timschoch/skilly add <bundle...>` — installs, rules, commit, PR.
3. Stack setup skills where the stack needs them (e.g. `trigger-setup`): add, follow, remove.
4. `npx github:timschoch/skilly update` — ends with its own commit.
5. Read `.agents/skills/audit-skilly-workflow/SKILL.md` in full and follow it: the rules, hooks and gates just installed get checked against what the repo and the user's global files already say. Show the report path, stop; fix only what the user picks.

## Validate

After the PR merges: `gh workflow run skilly-sync.yml`, then `gh run watch` until green. Local auth tests on this Mac lie (the machine SSH key bypasses `$HOME` isolation).
