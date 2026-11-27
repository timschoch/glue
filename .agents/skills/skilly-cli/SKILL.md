---
name: skilly-cli
description: Manage this repo's agent skills with the skilly CLI — add or remove bundles/skills, pull hub updates. Use when the user wants skills or bundles added, removed, or updated. For a skills.sh URL use the skills CLI directly, not skilly.
---

# Skilly CLI

This repo's skills are managed by skilly, a hub at `timschoch/skilly`. Always use the CLI; never install skills by manual copies.

Exception — the user posts a skills.sh URL: that skill lives outside the hub. Hand-pin it with the skills CLI: `npx -y skills add <url> --agent claude-code -y`. It lands in `skills-lock.json`; skilly never touches hand-pins.

- Add a bundle or single skill: `npx -y github:timschoch/skilly add <name...>`. The first add creates `.skilly/config.json`. Bundle names and what they contain: [catalog](https://github.com/timschoch/skilly/blob/main/docs/bundles.md)
- Remove: `npx -y github:timschoch/skilly remove <name...>`. Takes out a bundle or a skill added by name. A skill another bundle still claims stays.
- Pull the hub's current bundles: `npx -y github:timschoch/skilly update`. Needs a clean working tree. Never asks about removals: it removes a bundle or skill the hub dropped; review it in the PR. A skill added by name stays (`add` records it under `skills` in `.skilly/config.json`). Nothing to change: exits 0, no branch, no commit.
- Factory or CI job that commits other changes in the same PR: `npx -y github:timschoch/skilly update --no-commit`. Only changes files; the caller commits.
- Older Release: `github:timschoch/skilly#<tag>`.

Branch: on `main` or the default branch, each verb switches to `chore/skilly` once it has a change. On another branch it asks once, then remembers the answer in `.git/config`. Without a terminal it fails instead of asking. To allow the current branch without a terminal or a `.git/config` change, set the key through env config: `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=skilly.use-current-branch GIT_CONFIG_VALUE_0=true`. Each verb refuses a dirty working tree, then commits on its branch and stops. It never pushes and never opens a PR. Push and PR follow `.claude/rules/workflow-done.md`. An unknown name changes nothing.

Never hand-edit skilly-owned files — the next update rewrites them:

- `.claude/skills/` and `.agents/skills/` (installed skills)
- `.claude/rules/<name>-*.md` (installed router rules)
- `.skilly/config.json`, `.skilly/mcp.json`, `skills-lock.json`

A change to a skill belongs in its source repo (see `skills-lock.json` for the source), a repo-local rule in `CLAUDE.md`. A bug in an installed skill or rule: file it before you work around it, see `.claude/rules/workflow-hazards.md`.
