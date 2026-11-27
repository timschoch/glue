---
name: writing-rules
description: >
  The writing rules for every repo artifact: docs, code comments, commit messages,
  PR bodies, issue bodies. Use before writing or reviewing prose anywhere in a
  repo — README, docs, CLAUDE.md, skill files, commits, PRs, issues.
---

# Writing rules

The rule files in `rules/` are the source, synced from the hub: change them in the hub, never in a consumer or its installed copies in `.claude/rules/`, where only `*.local.md` overlays are allowed (see `workflow-writing-standards`). Enforcement varies per repo; the rules do not.

The rules live in rule files, one per style. skilly installs them into `.claude/rules/` with `paths:` frontmatter, so a native read or write of a matching `.md` file loads them. Read `all` plus one style, unless your host already loaded them for this file:

- [rules/writing-rules-all.md](rules/writing-rules-all.md) — every file: audience, words and links, the never list, where a statement lives
- [rules/writing-rules-plain.md](rules/writing-rules-plain.md) — a person reads it: README, docs, code comments
- [rules/writing-rules-dense.md](rules/writing-rules-dense.md) — only an agent reads it: CLAUDE.md, AGENTS.md, skill files, agent docs; where both could apply, dense wins
- [git.md](git.md) — commits, PRs, issues; no file write loads it, read it before you write one

Reviewing or writing prose? Read the files above — this file holds no rule.
