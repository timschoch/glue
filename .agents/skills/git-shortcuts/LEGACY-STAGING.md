# Legacy: repos still on `staging`

**Delete this file once every repo is on the trunk-based model** — and with it the "check the repo
has migrated" block in `SKILL.md`. Nothing else refers to it.

Trunk-based (`ticket → main`, releases cut by release-please tags) is the target. Repos migrate one
at a time. Until a repo is migrated it still runs `feature/fix/chore → staging → main`, and the
shortcuts behave as described here.

## Detecting it

```bash
git ls-remote --exit-code --heads origin staging > /dev/null 2>&1 && echo LEGACY
```

`LEGACY` → say so before doing anything: "Dieses Repo ist noch auf `staging` — PRs gehen nach
`staging`, `--release` gibt es hier nicht." Then follow this file instead of the trunk rules.

## How the shortcuts behave until then

- `pr` targets `staging`: `gh pr create --base staging`. Never `main`.
- `m` merges with `--squash` — the feature branch dies after merge. There are no `epic/*` branches
  here, so there is no merge-commit exception.
- `--pub` promotes `staging` → `main` (see below). On a migrated repo the same word is an alias for
  `--release`.
- `--release` does not exist here: no release PR, no tags. Report that and stop.
- **Never merge or backmerge `main` into `staging`.** No bulk merge, no `chore: merge main into
  staging`, no auto-generated sync branch. `staging` only advances via commits landing directly on
  it (or a cherry-pick); `main` only advances via `--pub`. If they diverge outside a `--pub`, fix
  forward on `staging` — do not pull `main` back in.
- `--close` is unchanged from `SKILL.md` (worktree disposal). The branch-deleting version is retired
  everywhere — GitHub removes the remote head branch on merge (`delete_branch_on_merge`).

## The `--pub` command (staging repos only)

Publishes `staging` → `main`. No branch guard — can be run from any branch.

1. **Find or create the PR** — `gh pr list --base main --head staging --state open --json number,url`.
   None → `gh pr create --base main --head staging` (standard PR protocol for title + body).
2. **Check mergeability** — `gh pr view <n> --json mergeable,mergeStateStatus`
   - `MERGEABLE` → proceed.
   - `CONFLICTING` → stop and ask: "Es gibt Merge-Konflikte zwischen `staging` und `main`. Soll ich
     dir helfen, sie zu beheben?" Wait. Never resolve by blanket-taking `staging` — verify first
     that nothing exists only on `main` (`git diff origin/staging...origin/main`, three dots). A
     repo that once published with `--squash` carries a frozen merge base, so the *first* publish
     after switching may still conflict once; it self-heals afterwards.
   - `UNKNOWN` → re-poll up to 3 times, 5 s apart. Still `UNKNOWN` → report and stop.
3. **Merge, never squash** — `gh pr merge <n> --merge --subject "Publish staging → main"`

   A squash commit's only parent is main's previous tip, so staging's commits never become ancestors
   of `main` and the merge base freezes. Every later publish then diffs against a stale base and
   conflicts on any file touched on both sides — even when `staging` is a pure superset — and the
   drift compounds. A merge commit keeps ancestry intact.

   **Rule: squash for branches that die (`feature → staging`), merge for branches that live
   (`staging → main`).** If the merge is rejected (merge commits disallowed, or `main` requires
   linear history): stop and report. **Do not fall back to `--squash`.** Ask the user to enable
   merge commits under Settings → General → Pull Requests → Allow merge commits.
4. **Slack summary** — same protocol as after `m` in `SKILL.md`.

### `--pub?`

Inspect the open `staging` → `main` PR: number, title, URL, `mergeable`, merge state. Then
`git fetch origin --quiet` and additionally report:

- commits ahead — `git rev-list --count origin/main..origin/staging`
- commits on `main` not in `staging` — `git rev-list --count origin/staging..origin/main`
  (non-zero means a frozen base from an earlier squash)
- conflicting files — `git merge-tree --write-tree --name-only origin/main origin/staging`
  (exit 0 = clean; exit 1 = conflicts, where line 1 is a tree hash and every line after it up to the
  first blank line is a conflicting path)

Do not merge.

## Migrating a repo to trunk-based

Reference implementation: `colin`, PR #374.

1. **Drain `staging`** — land everything on it into `main` with a final `--pub` (merge commit, not
   squash), so no work is stranded.
2. **Add release automation** — `.github/workflows/release.yml` running
   `googleapis/release-please-action@v5` on `push: branches: [main]`, plus a `workflow_dispatch`
   input that re-migrates and re-deploys an existing tag (the repair path when a deploy fails after
   the tag was created). release-please keeps one release PR open and rewrites it on every merge;
   merging a feature only updates that PR — `release_created` stays false and nothing ships.
3. **Give that workflow sole ownership of production** — migrations run in it immediately before the
   build, and the provider's own Git deploys are switched off (`vercel.json`:
   `"git": { "deploymentEnabled": false }`). Exactly one thing deploys.
4. **Record the base branch per branch** — `git config branch.<name>.laicaBase`, written by
   `wt:add`. `epic/*` is the only non-trunk base; anything unverifiable falls back to the trunk.
5. **Adopt `epic/<name>`** for features spanning several tickets, and merge epics into the trunk
   with `--merge` so release-please still sees the per-ticket commits.
6. **Retire `staging` last** — delete it on origin only after the first successful release. The
   detection above keys off its existence, so the skill flips over the moment it is gone.
7. **Write it down** — update the repo's conventions doc and add an ADR for the change.
