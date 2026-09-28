# Package prompt template

Build each agent's prompt from this skeleton. Fill `$…`; drop sections that don't apply. Everything sequence-sensitive must be in here — messages sent mid-flight cross with the agent's pushes.

```
Run /implement for sub-issue #$N ($TITLE). Full native flow: claim the issue,
own worktree, TDD, /code-review, open your own PR with "Closes #$N".

## Environment
- Nest your worktree under <session-toplevel>/.temp/ or use `npm run worktree:up`
  (repo-boundary hook blocks sibling worktrees). Run `scripts/worktree-up.sh`
  before any db test — it gives the worktree its own DB + port, idempotent.
- Commit messages with a body: write to a file INSIDE the worktree, `git commit -F`.
- gh comment bodies via `--body-file`, never heredocs.
- Vercel preview red is usually infra, not your code — CI verify is your gate.

## Ledger
Your sub-issue is your ledger. Post a condensed 🤖 comment whenever anything
relevant happens or you decide something without the owner:
`🤖 decision (bot): <one line>` + 2–4 lines why. Types: decision|question|blocker|progress.

## Review routing
Your /code-review child agents may report their verdicts to the ORCHESTRATOR,
not to you. Don't wait for results that never arrive — ask the orchestrator to
relay, then apply the fix list and push the fixes.

## Conflict posture            [parallel pair on shared files only]
#$M runs in parallel and touches $SHARED_FILE too. Keep your changes to it
additive and minimal. Second-to-merge rebases.

## Salvage                     [archive branch exists only]
`archive/$BRANCH` holds reviewed code from an earlier run. You may cherry-pick
hunks WITHIN your ticket scope, and you MUST diff your implementation against
the archive's equivalent hunk before requesting review — it has already fixed
bugs you will otherwise reintroduce. Re-verify everything you take.

## Finish checklist — you are not done until the PR is open
1. Before opening the PR: `git fetch` + rebase onto origin/main + re-run verify.
   If the PR later shows CONFLICTING, rebase again unprompted.
2. Commit → push → confirm the branch exists on origin.
3. Open the PR: "Closes #$N", verify-green.
4. Ledger comment on #$N: 🤖 progress — PR opened, link.
5. SendMessage the orchestrator: PR number + one-line status.
On any error: message the orchestrator with the exact error. Never go idle
silently — idle without a report reads as a stall.

## Out of scope
$OUT_OF_SCOPE  (merging, docs wrap-up, and infra belong to the orchestrator)
```
