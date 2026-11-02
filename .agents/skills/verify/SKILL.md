---
name: verify
description: The one definition of what each gate runs. Use to run a gate stage, to add or change a check, or to read why a step exists.
---

# Verify

verify merges 3 layers, a later one wins:

1. `.skilly/engine/verify/verify.json` (Hub: `engine/verify/`): the default steps. Sync keeps them current in every Consumer.
2. The `verify` block in the `config.json` of each Bundle in `.skilly/config.json`, includes too. See [Bundle steps](#bundle-steps).
3. `.skilly/verify.json`: only what the repo changes.

Hooks and CI call a stage of the merged config, so the local gate and the pipeline cannot drift into disagreeing about what green means.

## Usage

```sh
node .skilly/engine/verify/verify.mjs <stage>                  # run the stage
node .skilly/engine/verify/verify.mjs <stage> --results <file> # run, and write each step's result as JSON
node .skilly/engine/verify/verify.mjs <stage> --steps          # resolved steps as JSON, runs nothing
node .skilly/engine/verify/verify.mjs --config                 # merged config as JSON, runs nothing
```

Works from anywhere in the Consumer. A red step does not stop the stage: every step runs, and the summary lists each one as `ok`, `FAILED` or `skip`. Exit 0 passed, 2 config or usage error, anything else is the code of the first red step.

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
| `commit` | nothing by default | `pre-commit` calls `lint-edited-file.mjs` on the staged files directly |
| `push` | branch name, typecheck, `unit (changed)`, plus `conventional-commits` and `naming` from the `workflow` Bundle | the `pre-push` hook |
| `ci` | `push`, lint, full `unit`, build, audit, `e2e smoke` | CI on a PR; on the release PR where a PR runs `pr` |
| `pr` | `ci` without full `unit` and `e2e smoke`; a step with `paths` only when one of them changed | CI on a PR of a product repo with a release PR and a nightly |
| `nightly-scan` | deps drift, security scan | the nightly workflow when no commit came since the last finished night |
| `nightly` | `nightly-scan`, full `unit`, `e2e full` | the nightly workflow, product tier |

`pr` needs its net: each merge to main meets the full suites on the release PR and in the nightly. `.skilly/engine/verify/plan.mjs` picks the stage for the Managed `ci.yml` and `nightly.yml`: `pr` only where both exist, and the night from the last commit and the last finished night.

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

## Bundle steps

A Bundle adds steps in its `config.json`. One flat list, each step names its stage:

```json
{ "verify": { "fullSuiteTriggers": [], "steps": [{ "name": "naming", "stage": "push", "run": "node .agents/skills/naming/scripts/check.mjs" }] } }
```

A step needs `name`, `stage` and `run`. The other step fields work as in the defaults:

| Field | Effect |
| --- | --- |
| `"paths": ["src/", "*.css"]` | in a stage with `changedOnly`, runs only when the diff to the default branch holds a match. Patterns as in [Changed tests](#changed-tests) |
| `"toolchain": ["playwright"]` | CI installs it before the stage runs. `plan.mjs` names the toolchains it knows. It also finds one by name in the step's command and in the package.json scripts it calls, so such a step declares nothing |
| `"issueLabels": ["nightly-tests"]` | in the nightly, a red step opens or updates one issue per first label |

verify reads the Bundle configs from `.skilly/engine/bundles/`, or from `bundles/` in the Hub. With neither, it prints a note and runs without the Bundle steps.

## Override

`.skilly/verify.json` merges over the defaults and the Bundle steps (`.skilly/engine/verify/merge-config.mjs`). Steps match by `name`, per stage:

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

A step's `dependency` is a package name; not in `dependencies` or `devDependencies` of the root `package.json`, the step is skipped. The unit steps use `"dependency": "vitest"`: vitest runs with no config file, and its config has many names. Vitest only in a workspace `package.json`: set `"dependency": null` on the unit steps in `.skilly/verify.json`.

## Audit

The `audit` step ([scripts/audit.mjs](scripts/audit.mjs)) fails on every high or critical advisory. It runs `yarn audit` (yarn 1) when `yarn.lock` exists, else `npm audit`. An advisory with no patched version goes on the step's `accept` list in `.skilly/verify.json`:

```json
{ "stages": { "ci": { "steps": [{ "name": "audit", "accept": [{ "id": "GHSA-vfj7-8cjw-p6xm", "why": "braces, no fix, dev only" }] }] } } }
```

An entry needs an `id` and a `why`; without both it accepts nothing. It fails the step once GitHub lists a patched version for the range the audit matched, or once the audit no longer finds the advisory. Remove it then. The step never edits the file, so the local gate and CI give the same answer.

## Hook scripts

The gates and guards ship in the Engine, `.skilly/engine/verify/`, so each Sync PR updates them. The Sync wires them from the hook entries in the workflow Bundle's `config.json`; never copy one into the repo.

| Script | Run by | Blocks |
| --- | --- | --- |
| `check-commit-msg.mjs` | `commit-msg`; with `--branch` the `conventional-commits` step | a commit header that is not Conventional Commits |
| `check-push-branch.mjs` | `pre-push` | a direct push to the trunk; a pushed branch not named `<type>/<description>`, by its remote name, not `HEAD` |
| `check-branch-name.mjs` | the `branch name` step | a branch not named `<type>/<description>` |
| `block-destructive-git.sh` | Claude Code PreToolUse | `reset --hard`, `clean -f`, `branch -D`, bare `push --force` |
| `block-invalid-branch-push.sh` | Claude Code PreToolUse | an agent push from a bad branch name, even without installed git hooks |
| `block-unverified-push.sh` | Claude Code PreToolUse | an agent push that skips the `push` stage |
| `lint-edited-file.mjs` | Claude Code PostToolUse, `pre-commit` | an agent edit or a staged file that leaves oxlint errors; it also runs Prettier on the file |

## Adding a check

One step, never a line in a hook or a workflow. A check for this repo only goes in `.skilly/verify.json`. A check every Consumer needs goes in the hub's `engine/verify/verify.json`. A check that comes with a Bundle goes in that Bundle's `config.json` `verify.steps`. Give it a `why`: it prints the moment the step goes red, when the reader is least likely to go looking for it.
