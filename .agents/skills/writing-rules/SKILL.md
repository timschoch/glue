---
name: writing-rules
description: >
  The writing rules for every repo artifact: docs, code comments, commit messages,
  PR bodies, issue bodies. Use before writing or reviewing prose anywhere in a
  repo — README, docs, CLAUDE.md, skill files, commits, PRs, issues.
---

# Writing rules

One list, one copy, synced from the hub — rules update here, never in a consumer. Enforcement varies per repo; the rules do not.

The rules live in sidecar files, one per style, so only what applies gets injected:

- [rules/all.md](rules/all.md) — every file: audience, words and links, the never list, where a statement lives
- [rules/plain.md](rules/plain.md) — a person reads it: README, docs, code comments
- [rules/dense.md](rules/dense.md) — only an agent reads it: CLAUDE.md, AGENTS.md, skill files, agent docs; where both could apply, dense wins
- [rules/git.md](rules/git.md) — commits, PRs, issues; the format is enforced by setup-repo's commit gate

Reviewing or writing prose by hand? Read the sidecars above — this file holds no rule.

## Injection on write actions

[scripts/inject-writing-rules.mjs](scripts/inject-writing-rules.mjs) is a PreToolUse hook: on every file-writing tool call it prints the matching rules (all + plain|dense by path) as additional context, so the writer sees them without loading this skill. `/setup-repo` wires it into `.claude/settings.json`. Markdown files only; `node_modules`, `.temp/` and the synced `.claude/skills`/`.claude/rules` trees are skipped.
