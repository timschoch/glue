---
name: orchestrate
description: "Orchestrate a multi-ticket feature: one /implement agent per sub-issue; orchestrator sequences, relays, merges."
disable-model-invocation: true
---

Run a pre-specced feature across parallel `/implement` subagents on worktrees.

## Rule Zero

Never slice or map the work yourself. The parent issue's sub-issues ARE the work packages: fetch them, hand each verbatim to one `/implement` agent. Sub-issues missing or unclear → stop and ask the owner; do not invent packages. Process fidelity is a requirement — a correct deliverable produced off the pre-specced path gets rejected.

## Roles

- **Orchestrator (you)**: read-only + `gh` + spawning. Never edit `src/`. Your job: sequencing, relay, verification between phases, merges, cleanup, ops sidecar (see [`ops.md`](ops.md)).
- **Agents**: full `/implement` flow — native claim, own worktree, TDD, /code-review, own PR. Duplicate none of it here.
- **Mechanical tail** (merge order, CI watch, branch/worktree cleanup) belongs to the orchestrator. Agents end at "PR open + report".

## Ledger

The GitHub issue is the ledger. Whenever anything relevant happens or a decision is made without the owner, post a condensed comment — orchestrator on the parent issue, each agent on its sub-issue:

```
🤖 decision (bot): <one line>
<2–4 lines: why, link>
```

Types: `decision` | `question` | `blocker` | `progress`. Always the 🤖 prefix; decisions explicitly marked `(bot)`. Post via `gh issue comment N --body-file .temp/<f>.md` (heredocs are blocked). Questions go on the issue and the run proceeds where a tolerant default exists — don't block.

## Run sequence

1. **Sync + fetch sub-issues.** `git fetch && git pull --ff-only` (the main checkout's branch drifts — verify `git branch --show-current`; always branch from `origin/main`). Then fetch sub-issues — GraphQL only, `gh issue view` does not render them:
   ```
   gh api graphql -f query='query{ repository(owner:"$OWNER",name:"$REPO"){ issue(number:$N){ subIssues(first:50){ nodes{ number title state } } } } }'
   ```
   Never claim a GitHub feature is absent from CLI output alone. Done when: every sub-issue is listed with its "Blocked by" edges, or the owner has been asked.
2. **Recon + feasibility.** Read the seam files yourself — agent summaries miss API gaps. Diff the spec against current behavior before spawning the affected package. Specs may be AI-written: any one-time external setup step (webhook, OAuth app, DNS, third-party config) gets verified against current provider docs before an agent bakes it into docs — e.g. webhooks need a SECRET, not a token; `projects_v2_item` events are org-webhook-only. Gaps → ledger `question`. Done when: every external-world assumption is verified or ledgered.
3. **Sequence + hotspots.** Order from each ticket's "Blocked by". Flag shared-file hotspots (e.g. one ADR taking amendments from several tickets): serialize them, or pre-agree the conflict posture in the prompts ("keep shared-file changes additive; second-to-merge rebases"). "New files only" = parallelizable; "touches shared files" = single writer.
4. **Spawn.** One `/implement` agent per sub-issue, prompt built from [`package-prompt.md`](package-prompt.md). Sequence-sensitive rules (rebase-before-PR, conflict posture, merge order) go in the original prompt — a mid-flight message crosses with the agent's push and arrives too late.
5. **Relay + verify.** An agent's /code-review children report to YOU, not to it — relay verdicts and fix lists promptly; the relay doubles as your QA checkpoint. Idle ≠ done: before acting on any "finished" signal, verify observable state — branch on origin, `git diff --stat`, the fix present in the diff (not just the ack). After any relay, expect one more round-trip. Nudge with "finish your remaining steps", never "push now" — a hurried agent skips its own QA.
6. **Merge.** On green CI only: `gh run watch <id> --exit-status && gh pr merge <n> --squash --delete-branch && <cleanup>` chained in one background call. You own merge order; second-to-merge rebases. Done when: every sub-issue has exactly one merged PR carrying `Closes #<sub>`.
7. **Wrap-up.** One final docs PR for shared-line docs (CLAUDE.md current focus) — never per-ticket. Infra blockers you cannot reach (Neon/Vercel consoles are owner-only) are a legitimate terminal state: ledger a `blocker` on the PR with evidence + the owner action needed. Post the final 🤖 tally on the parent issue.

Salvage from an archived earlier run, deploy diagnosis, Projects v2 limits, destructive-script rules: [`ops.md`](ops.md).
