---
name: t3-threads
description: Spawn, message and watch worker threads in the T3 Code app on this machine. Use when an orchestrator hands a ticket to a new agent thread, checks on a worker, or cleans up after one.
---

# T3 threads

One script drives the local T3 Code server: [scripts/t3-threads.mjs](scripts/t3-threads.mjs). Run it with no arguments for the command list.

## Spawn a worker

```sh
node .agents/skills/t3-threads/scripts/t3-threads.mjs spawn \
  --repo . --branch feat/why-view --title "Why view" \
  --model claude-sonnet-5 --effort medium --prompt-file .temp/prompts/why-view.md
```

- Creates a git worktree under `~/.t3/worktrees/<repo>/<branch>` from `origin/main`, copies `.env.local`, writes `.temp/role` (`worker` unless `--role orchestrator`).
- Adds the repo as a T3 project when it has none. A new repo works the same way.
- Model IDs: `claude-opus-5-5`, `claude-sonnet-5`, `claude-fable-5-1`, `claude-haiku-4-5`. Pick per [model selection](../../../.claude/rules/workflow-model-selection.md).
- Refuses when 3 threads run on this machine. The limit covers every repo, not one.

## The worker prompt

Every prompt ends with the report contract, word for word:

```text
End your final message with one line:
RESULT: done <PR URL>
RESULT: blocked <what blocks you>
RESULT: question <your question>
```

A turn that ends is not work that is done. `completed` only means the thread stopped talking.

## Watch and answer

| Command | Use |
| --- | --- |
| `status` | All tracked threads and their turn state |
| `status <id>` / `wait <id>` | Report of one thread; `wait` polls until the turn stops (default 120 min) |
| `send <id> --prompt-file <f>` | Answer a `question`, send review findings, unblock |
| `remove <id> --worktree yes` | Delete the thread and its worktree after the merge |
| `role orchestrator` | Mark the current worktree as the orchestrator's |

`status` and `wait` return `result` (`done`, `blocked`, `question`, `none`) and `detail`. `none` on a stopped turn: the worker quit without the contract. Send it back with the contract.

## Auth

The script issues its own T3 token (1 hour, cached in `~/.cache/t3-threads/token.json`, mode 600) and renews it before expiry. The token never goes to stdout. It has full control of T3 on this machine: keep it out of prompts, logs and commits.
