# babysit-pr

Ported from [`openai/codex`](https://github.com/openai/codex) `.codex/skills/babysit-pr`, commit `84aa75204ad604bcf498df180d128181c89b2f0b`.

Portions derived from openai/codex, Copyright OpenAI, licensed under the Apache License 2.0.

Changed here: the 951-line Python watcher is replaced by four bash + jq scripts in [`scripts/`](scripts); the loop merges only in merge mode (`--merge`, or the user says merge), otherwise it stops at green and reports per the sign-off rule (`.claude/rules/workflow-sign-off.md`); one CI budget of 3 attempts per PR covers fix pushes and reruns together; the reviewer set comes from `.skilly/config.json` -> `.review.bots` instead of a hardcoded bot login.

Logic proof, stubbed `gh` on PATH: `bash scripts/pr-state.test.sh`, `bash scripts/watch.test.sh`, `bash scripts/classify-failure.test.sh`.
