---
name: skilly-cli
description: Manage this repo's agent skills with the skilly CLI — add or remove bundles/skills, pull hub updates. Use when the user wants skills or bundles added, removed, or updated. For a skills.sh URL use the skills CLI directly, not skilly. Not for repo bootstrap (that is `skilly setup`, run once).
---

# Skilly CLI

This repo's skills are managed by skilly, a hub at `timschoch/skilly`. Always use the CLI; never install skills by manual copies.

Exception — the user posts a skills.sh URL: that skill lives outside the hub. Hand-pin it with the skills CLI: `npx -y skills add <url> --agent claude-code -y`. It lands in `skills-lock.json` and survives the sync; skilly never touches hand-pins.

- Add a bundle or single skill: `node .skilly/engine/bin/skilly.js add <name...>`. Bundle names and what they contain: [catalog](https://github.com/timschoch/skilly/blob/main/docs/bundles.md)
- Remove: `node .skilly/engine/bin/skilly.js remove <name...>`. Takes out a bundle or a skill added by name. A skill another bundle still claims stays.
- Move to the newest Release now: `node .skilly/engine/bin/skilly.js sync`. The nightly does the same for every Consumer.

`add` and `remove` edit `.skilly/config.json`, then run the Sync at the pinned Release (`hub` in that file; none yet: the newest Release, then pinned). They print the Sync report: Release before and after, skills added and removed, files written. They never commit or push. Review the files, then commit them on a `<type>/<description>` branch. An unknown name or a failed Sync leaves the config as it was.

`sync` fetches the newest Release and runs that Release's Engine on a fresh copy of the default branch, with your `gh` login. It pushes `chore/skilly-sync`, opens the Sync PR or updates the open one, and prints its link. Your checkout and branch stay as they were. Auto-merge goes on, except for a new major Release (a first Sync counts as one) or a removal: merge those by hand. Nothing to sync: no push, no PR.

No `.skilly/engine/` yet: run `npx -y github:timschoch/skilly add <name...>`, `remove <name...>` or `sync` instead. They run the same Engine verbs and need `.skilly/config.json`. No config: run `npx -y github:timschoch/skilly setup`.

Never hand-edit skilly-owned files — the nightly sync wipes and rewrites them:

- `.claude/skills/` and `.agents/skills/` (installed skills)
- `.claude/rules/<name>-*.md` (installed router rules)
- `.skilly/config.json`, `skills-lock.json`
- `.skilly/engine/` and `.skilly/engine.json` (the Engine and its hash). A hand edit stops every Sync until you restore it with `git checkout -- .skilly/engine`.

A change to a skill belongs in its source repo (see `skills-lock.json` for the source), a repo-local rule in `CLAUDE.md`. A bug in an installed skill, hook, or rule: file it before you work around it, see `.claude/rules/workflow-hazards.md`.
