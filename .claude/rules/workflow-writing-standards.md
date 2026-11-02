# Writing standards

Run the `unslop` skill on every output before it ships — prose, docs, commit messages, PR bodies, issue text. No exceptions for "small" outputs; slop compounds.

When a correction repeats, encode it as one bad and one good example next to the rule, not as more prose. Agents learn the pair better than the sentence. Where the pair goes:

- Rule in `CLAUDE.md` or a repo-owned rule file: under the rule, in place.
- Rule synced by skilly (`.claude/rules/<bundle>-<rule>.md`): in `.claude/rules/<bundle>-<rule>.local.md`, same item number as the rule it extends. Sync never touches `*.local.md`. Pairs that repeat across repos get hoisted into the hub rule by `audit-agent-history`.
- No rule yet: write the rule and the pair together in `CLAUDE.md`.

## Posts on repos we do not own

Issues, comments, PR bodies and reviews on a repo outside our own accounts: precise and humble, never submissive.

- State what we found in clear technical words: version, input, expected vs actual.
- Give the fix we *think* is right, with the reason. It is a guess, not a verdict.
- Code we add is a suggestion for the maintainers to look at, not a patch to apply.
- Never give instructions: no "run this", "change that", "you need to".
- No apologies, no self-doubt filler, no praise padding.

- Bad: "Change `parse()` to trim the input. Run `npm test` to confirm."
- Bad: "Sorry to bother you, I'm probably wrong, but maybe `parse()` has an issue?"
- Good: "`parse('a\n')` throws `RangeError` in v2.3.1, expected `['a']`. We think a trim before the split fixes it, because the trailing newline yields an empty token. Untested sketch below, as a suggestion."
