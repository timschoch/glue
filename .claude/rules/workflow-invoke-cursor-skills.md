# Router rules

Hand-maintained: one row per `principle-*` skill in `bundles/workflow/config.json`, plus `make-pr-easy-to-review`.

Good defaults, not law — the developer's word overrides anything here.

Do not invoke these skills via the Skill tool — some carry `disable-model-invocation`
and the tool refuses them. Instead, when the trigger in the first column matches,
read the linked file **in full** and apply its content.

| When | Read and apply |
| --- | --- |
| Apply when you catch yourself writing the same instruction a second time, or notice a recurring correction. Encode the rule as a lint, metadata flag, runtime check, or script instead of more text. | [principle-encode-lessons-in-structure](.agents/skills/principle-encode-lessons-in-structure/SKILL.md) |
| Apply when debugging. Trace each symptom to its root cause and fix it there; reproduce first, ask why until you reach it, resist nil-check guards that silence crashes. | [principle-fix-root-causes](.agents/skills/principle-fix-root-causes/SKILL.md) |
| Apply when context is filling up: large outputs, long files, repeated reads, fan-out planning. Route bulk to subagents; keep summaries in the main thread, not raw payloads. | [principle-guard-the-context-window](.agents/skills/principle-guard-the-context-window/SKILL.md) |
| Apply after completing a task, before declaring done. Verify against the real artifact (run the feature, read the actual value, inspect the diff), not a proxy, self-report, or 'it compiles.' | [principle-prove-it-works](.agents/skills/principle-prove-it-works/SKILL.md) |
| Prepare PRs for review by cleaning noisy history, improving PR descriptions, and adding reviewer guidance without changing code behavior. Use for "make this easy to review", "tidy this PR", "clean up commits", or "annotate the diff". | [make-pr-easy-to-review](.agents/skills/make-pr-easy-to-review/SKILL.md) |
