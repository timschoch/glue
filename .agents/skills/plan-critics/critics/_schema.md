---
name: _schema
description: Template — not a critic. Copy this to create a new critic file.
---

# Critic File Schema

Every critic file in `critics/` MUST follow this structure.
Files with a `_` prefix are excluded from loading by the orchestrator.

---

## Frontmatter (required)

```yaml
---
name: <slug>                          # matches filename without .md
type: universal | tech
activation: "always" | "<keywords>"  # space or comma separated; word-stem matched
standalone-skill:                     # optional: skill(s) whose SKILL.md the subagent loads first
  - <name>                           # YAML list; single value also accepted as plain string
---
```

`activation` for tech critics: list all keywords that suggest this critic is relevant.
Be generous — the orchestrator filters, so false positives here just add a check.

`standalone-skill`: when set, the subagent loads the skill's SKILL.md (path resolution order in SKILL.md Step 4 — installed dirs first, launch-repo fetch as fallback) and applies
its checklist before running its own. Use this for tech areas with an existing skill.

---

## Body sections

### (Required) What to check

Concrete checklist of 5–15 items — what the critic looks for in the plan.
Write as bullet points with specific, scannable descriptions.

### (Optional) Sources

External sources the subagent may consult:
- `standalone-skill` SKILL.md (loaded automatically)
- Context7 library IDs for current docs
- WebSearch hints (what queries are useful)

### (Optional) Codebase searches

Grep/Glob commands to run against the project. Use the Grep and Glob tools directly — not
Bash — to avoid shell-injection risk. Patterns are literal strings, not regex, unless noted.

### (Required) Return contract

Each critic returns findings as a JSON array in the DONE line.
The SKILL.md prompt template handles the exact format — do not repeat it here.
Just note any critic-specific fields or deviations if they exist.

---

## Example critic file

See `security.md` for a universal critic example and `nextjs.md` for a tech critic with a
standalone-skill.
