# Ops sidecar reference

Orchestrator-side work reached only on some runs. External-world changes mid-run (repo transfer, webhook registration, DNS/domain issues) are orchestrator work, never agent work.

## Salvage protocol (owner binned a run)

Archive the old branch as `archive/<issue>-<label>`. Restart along the sub-issues with native claims. In each affected prompt, include the Salvage section of the template — "may consult the archive" is too weak; the mandatory diff-vs-archive-hunk step is what prevents reintroducing already-fixed bugs.

## Deploy diagnosis chain (Vercel preview red)

`npm run verify` ≠ `next build` ≠ deployable — three different bars. Chain:

1. `gh pr checks` — which check, which deployment URL.
2. `vercel inspect <url> --logs` — returns nothing useful for provisioning failures.
3. Vercel REST v13 deployment detail: `errorMessage: "Resource provisioning failed"` + zero build events = died before build = infra, not code.
4. Correlate `v6/deployments` across branches/times to confirm infra-wide.

Every Vercel API call needs `teamId` (from `.vercel/repo.json`) or list calls return empty.

## GitHub Projects v2 API limits (verified)

`createProjectV2`, field/item mutations, `updateProjectV2` (readme), `linkProjectV2ToRepository` all work via raw GraphQL (`gh api graphql`). VIEWS and WORKFLOWS (auto-add) have no public mutations — UI-only; hand the owner a click list. `gh project create` is broken (malformed mutation) — use raw GraphQL. claude-in-chrome cannot drive the Projects SPA (persistent connections, injection timeouts) — stop after 2–3 timeouts, fall back to instructions.

## Owner-only infra

Neon/Vercel consoles and interactive auth (`neonctl` hangs in agent sessions) are owner-only. Blocked on them → ledger a `blocker` with evidence + the exact owner action; that is a legitimate terminal state, not a failure.

## Scripts touching real data

- Destructive scripts verify their own preconditions with abort guards (refuse when live values exist) — never trust the plan's snapshot.
- A data-fix script whose real data lives only in prod defaults to prod, and prints the target host in its confirm summary. State the target env in the brief.
- Content backfills (curated copy) are orchestrator work; code backfills are agent work.
