---
name: verify
description: The one definition of what each gate runs. Use to run a gate stage, to add or change a check, or to read why a step exists.
---

# Verify

[references/verify.json](references/verify.json) holds the default steps. Sync keeps them current in every Consumer. `.skilly/verify.json` holds only what the repo changes. Hooks and CI call a stage of the merged config, so the local gate and the pipeline cannot drift into disagreeing about what green means.

## Usage

```sh
node .agents/skills/verify/scripts/verify.mjs <stage>           # run the stage
node .agents/skills/verify/scripts/verify.mjs <stage> --steps   # resolved steps as JSON, runs nothing
node .agents/skills/verify/scripts/verify.mjs --config          # merged config as JSON, runs nothing
```

Works from anywhere in the Consumer. Exit 0 passed, 2 config or usage error, anything else is the failing step's code.

## Config

Shape of both files:

```json
{
  "budgetTicket": "https://github.com/owner/repo/issues/1",
  "stages": {
    "commit": { "budgetSeconds": 10, "steps": [{ "name": "lint-staged", "run": "npx lint-staged", "why": "the reason this step exists" }] },
    "push": { "extends": "commit", "budgetSeconds": 120, "steps": [] },
    "ci": { "extends": "push", "budgetSeconds": 600, "steps": [] },
    "nightly": { "tier": "product", "budgetSeconds": 1800, "steps": [{ "name": "e2e", "run": "npm run e2e", "target": "e2e" }] }
  }
}
```

`extends` is cumulative: `push` runs every `commit` step first. A stage skips an inherited step only where the config names it:

| Field | On | Effect |
| --- | --- | --- |
| `"replaces": "unit (changed)"` | a step | drops the named step when this step runs. `unit` holds the changed tests, so each test runs one time |
| `"without": ["unit", "e2e smoke"]` | a stage | drops the named inherited steps |

## Stages

| Stage | Runs | Called by |
| --- | --- | --- |
| `commit` | nothing by default | `pre-commit` calls `lint-staged` directly |
| `push` | branch name, naming, typecheck, `unit (changed)` | the `pre-push` hook |
| `ci` | `push`, lint, full `unit`, build, audit, `e2e smoke` | CI on a PR; on the release PR where a PR runs `pr` |
| `pr` | `ci` without full `unit` and `e2e smoke` | CI on a PR of a product repo with a release PR and a nightly |
| `nightly` | full `unit`, `e2e full`, deps drift, security scan | the nightly workflow, product tier |

`pr` needs its net: each merge to main meets the full suites on the release PR and in the nightly. The `ci.yml` template of `setup-repo` picks `pr` only where both exist.

## Changed tests

`unit (changed)` runs [scripts/run-changed-tests.mjs](scripts/run-changed-tests.mjs): the test command with `--changed <base>`, or the full suite when the diff holds a `fullSuiteTriggers` path. Vitest follows imports only, and no test imports a lockfile or a migration.

```json
{ "fullSuiteTriggers": ["drizzle/"] }
```

| Trigger | Matches |
| --- | --- |
| `drizzle/` | each file in that folder, from the git root |
| `package.json` | that file name at any depth |
| `vitest.config.*` | `*` is any characters inside one path segment |
| `src/schema.sql` | that path |

The list in `.skilly/verify.json` appends to the defaults; `"-package.json"` drops one.

A budget warns and never fails. A gate that fails on slowness teaches you to bypass the gate, and the bypass outlives the slowness. `budgetTicket` says where a stage that outgrew its budget gets split.

## Override

`.skilly/verify.json` merges over the defaults ([scripts/merge-config.mjs](scripts/merge-config.mjs)). Steps match by `name`, per stage:

| Repo file | Effect |
| --- | --- |
| `{ "name": "lint", "run": "pnpm lint" }` | changes the default `lint` step, keeps its other fields |
| `"-lint"` | drops the default `lint` step |
| `{ "name": "docs", "run": "…" }` | adds a step after the defaults |
| `"budgetSeconds": 60` on a stage | replaces the default |

An override of `unit` must run the full suite each time, because `unit` replaces `unit (changed)`. An override that runs the suite only on a condition must set `"replaces": null`.

The file is optional. Check the result with `--config` or `<stage> --steps`.

## Tier

`tier` in `.skilly/config.json`, default `sandbox`, order `sandbox` < `tool` < `product`. A step's `tier` is the minimum a repo needs to run it; below that the step is skipped. A stage's `tier` is that rule for the whole stage: below it nothing runs and the exit is 0. Tier sets the size of the net, not the standard.

## Target

A step's `target` is a path relative to the repo root; missing, the step is skipped. That is how one stage list fits repos that do not all have an `e2e/` or a Dockerfile.

## Audit

The `audit` step ([scripts/audit.mjs](scripts/audit.mjs)) fails on every high or critical advisory. It runs `yarn audit` (yarn 1) when `yarn.lock` exists, else `npm audit`. An advisory with no patched version goes on the step's `accept` list in `.skilly/verify.json`:

```json
{ "stages": { "ci": { "steps": [{ "name": "audit", "accept": [{ "id": "GHSA-vfj7-8cjw-p6xm", "why": "braces, no fix, dev only" }] }] } } }
```

An entry needs an `id` and a `why`; without both it accepts nothing. It fails the step once GitHub lists a patched version for the range the audit matched, or once the audit no longer finds the advisory. Remove it then. The step never edits the file, so the local gate and CI give the same answer.

## Hook scripts

The gates and guards ship here, so each Sync PR updates them. `/setup-repo` (setup-project bundle) wires them; never copy one into the repo.

| Script | Run by | Blocks |
| --- | --- | --- |
| [check-commit-msg.mjs](scripts/check-commit-msg.mjs) | `commit-msg` | a commit header that is not Conventional Commits |
| [check-push-branch.mjs](scripts/check-push-branch.mjs) | `pre-push` | a direct push to the trunk |
| [check-branch-name.mjs](scripts/check-branch-name.mjs) | the `branch name` step | a branch not named `<type>/<description>` |
| [block-destructive-git.sh](scripts/block-destructive-git.sh) | Claude Code PreToolUse | `reset --hard`, `clean -f`, `branch -D`, bare `push --force` |
| [block-invalid-branch-push.sh](scripts/block-invalid-branch-push.sh) | Claude Code PreToolUse | an agent push from a bad branch name, even without installed git hooks |
| [block-unverified-push.sh](scripts/block-unverified-push.sh) | Claude Code PreToolUse | an agent push that skips the `push` stage |

## Adding a check

One step, never a line in a hook or a workflow. A check for this repo only goes in `.skilly/verify.json`. A check every Consumer needs goes in the hub's `bundles/workflow/skills/verify/references/verify.json`. Give it a `why`: it prints the moment the step goes red, when the reader is least likely to go looking for it.
