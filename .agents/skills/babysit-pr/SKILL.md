---
name: babysit-pr
description: 'Watch a PR until it is merge-ready: CI, review threads, fix-push loop. Use for "babysit", "watch the PR", "get it green".'
disable-model-invocation: true
argument-hint: <pr-number|url> [--merge]
---

Hold one PR until it is merge-ready: poll, classify, fix, push, poll again. Terminal states are **merged**, **closed**, **needs-user**. Nothing else ends the loop, not a push, not a green run, not a report.

## Loop

Each pass:

1. **Snapshot.** `bash scripts/pr-state.sh <pr> [--since <lastPushAt>]`. Carry the previous pass's `lastPushAt` into `--since`, so only review items newer than your last push surface.
2. **Terminal first.** `state` is `MERGED` or `CLOSED`: report it and stop.
3. **Review items before CI.** A fix commit retriggers CI, so answering review first avoids spending a rerun on a SHA you are about to replace.
4. **CI.** For each check with a failing `conclusion`, run `bash scripts/classify-failure.sh <check-url>` before touching code.
5. **Push.** Commit on the PR head branch, push, then return to step 1 on the new SHA.
6. **Wait.** `bash scripts/watch.sh <pr>` blocks until the checks settle, then prints a fresh snapshot. Use it instead of sleeping. Cap it with `BABYSIT_MAX_MINUTES`, default 60.

## Rules

- **Published and fresh only.** Act on review items whose `submittedAt` or `createdAt` is newer than `lastPushAt`. `pr-state.sh` drops `PENDING` reviews: a reviewer still drafting has not spoken yet. An item answered before the last push stays answered.
- **Classify a failure, then act on the class.** `classify-failure.sh` prints `flaky` or `real` from log evidence, then the first 20 failing lines. `real`: patch the branch. `flaky`: rerun it with `gh run rerun <run-id> --failed`, budget **3 reruns per failing check**; budget spent means needs-user. While a failure reads `flaky`, leave tests, build scripts, CI config and dependency pins as they are. A patch that only silences infra hides the signal for everyone downstream.
- **Humans get the user's words, not yours.** A human reviewer is any `reviews[].author` that is neither the PR author nor flagged `isBot`. Surface their item to the user with a suggested reply, and wait for explicit confirmation before posting anything to GitHub. Bot items you act on and resolve yourself.
- **Resolve what you fixed.** Once the fix is pushed: `bash scripts/resolve-thread.sh <threadId>`, using `threads[].id` from the snapshot.
- **Merge is the user's call.** The sign-off rule (`.claude/rules/workflow-sign-off.md`): staged means done, committed means signed off. Stop at green and report. Run `gh pr merge <pr> --auto --squash` only when invoked with `--merge`, or when the user says merge in this session.
- **Green is a milestone, not an exit.** No failing check, `mergeable: MERGEABLE`, no unresolved thread: report "ready to merge", then keep polling. Late review items still land while the PR is open.

## Reviewer set

`pr-state.sh` reads bot logins from `.skilly/config.json` at the git root:

```json
{ "review": { "bots": ["chatgpt-codex-connector[bot]", "some-reviewer"] } }
```

A login ending in `[bot]` also counts. Missing key or missing file means an empty list, and every reviewer but the PR author reads as human. Read the config each run; keep no login in your head.

## CI

Checks are whatever the PR reports. The repo's tier in `.skilly/config.json` decides the set (the `verify` skill explains tiers). `verify` is the one check every tier runs, so a red `verify` is always a statement about this branch.

## Commits

Conventional commit, prefix by content: `fix:` when a check was red, `chore:` for a lint or config nit. Add one body line, so the origin of the change stays greppable:

```
Babysit-pr: fixes review thread <thread-url>
```

## Report

Close every pass with: head SHA, check tally, mergeability, what was pushed, reruns spent, what is still open.
