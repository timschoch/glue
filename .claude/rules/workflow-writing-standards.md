# Writing standards

Run the `unslop` skill on every output before it ships — prose, docs, commit messages, PR bodies, issue text. No exceptions for "small" outputs; slop compounds.

When a correction repeats, encode it as one bad and one good example next to the rule, not as more prose. Agents learn the pair better than the sentence. Where the pair goes:

- Rule in `CLAUDE.md` or a repo-owned rule file: under the rule, in place.
- Rule synced by skilly (`.claude/rules/<bundle>-<rule>.md`): in `.claude/rules/<bundle>-<rule>.local.md`, same item number as the rule it extends. Sync never touches `*.local.md`. Pairs that repeat across repos get hoisted into the hub rule by `audit-agent-history`.
- No rule yet: write the rule and the pair together in `CLAUDE.md`.
