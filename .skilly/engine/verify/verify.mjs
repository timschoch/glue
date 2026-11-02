#!/usr/bin/env node
// The one definition of what each gate runs in a Consumer. Git hooks and CI workflows both call a
// stage of this script, so the local gate and the pipeline cannot drift into disagreeing about
// what green means.
//
// The steps come from 3 layers, merged in this order (rules in merge-config.mjs):
//   1. `verify.json`, the defaults every Consumer gets on sync
//   2. the verify steps of the Bundles named in `.skilly/config.json` (bundle-steps.mjs)
//   3. the repo's `.skilly/verify.json`, optional
// Steps match by `name`: the repo changes a default or Bundle step by naming it, drops one with
// `"-<name>"`, and adds its own under a new name.
//
// A red step does not stop the stage. Every step runs, and the summary lists each result, so one
// run shows everything to fix. The exit code is the first red step's.
//
// Stages are cumulative through `extends`: `push` contains `commit`, `ci` contains `push`.
// Cumulative by default, so a stage skips a check the stage below it runs only where the config
// says so by name. `tier`, `target` and `dependency` subtract: a repo runs a step only once it is
// big enough for it, and only when the thing the step checks is there. `replaces` on a step drops
// the step it covers, so the full unit suite does not rerun the changed tests. `without` on a
// stage drops inherited steps: `pr` is `ci` without the suites that the release PR and the nightly run.
// `changedOnly` on a stage skips a step with `paths` when none of them changed against the
// default branch, patterns as in changed-files.mjs. A step without `paths` always runs.
//
// A budget warns and never fails. A gate that fails on slowness teaches you to bypass the gate,
// and the bypass outlives the slowness. `budgetTicket` in the config says where a stage that has
// outgrown its budget gets split.
//
// Usage:
//   node .skilly/engine/verify/verify.mjs <stage>
//   node .skilly/engine/verify/verify.mjs <stage> --results <file>   also writes each step result as JSON
//   node .skilly/engine/verify/verify.mjs <stage> --steps    resolved steps as JSON, runs nothing
//   node .skilly/engine/verify/verify.mjs --config           merged config as JSON, runs nothing
//
// The flag is `--steps` and not `--print`, because `--print` is node's own eval flag and the
// shell allowlist refuses any command that carries it.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleSteps, findBundlesDir } from './bundle-steps.mjs';
import { findMatch, listChangedFiles } from './changed-files.mjs';
import { defaultBranch } from './default-branch.mjs';
import { mergeConfig } from './merge-config.mjs';

const TIERS = ['sandbox', 'tool', 'product'];
const DEFAULTS_PATH = join(dirname(fileURLToPath(import.meta.url)), 'verify.json');
const MARKERS = [join('.skilly', 'config.json'), join('.skilly', 'verify.json')];

const fail = (...lines) => {
  for (const line of lines) console.error(`verify: ${line}`);
  process.exit(2);
};

/** The nearest ancestor of `from` that is a Consumer: it carries a `.skilly/config.json` or `.skilly/verify.json`. */
const findRoot = (from) => {
  let directory = resolve(from);
  for (;;) {
    if (MARKERS.some((marker) => existsSync(join(directory, marker)))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
};

const readJson = (path, label) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return fail(`${label} does not parse — ${error.message}`);
  }
};

const root = findRoot(process.cwd());
if (!root) fail('no .skilly/config.json or .skilly/verify.json in this directory or any parent, so there is no repo to verify.');

const settingsPath = join(root, '.skilly', 'config.json');
const settings = existsSync(settingsPath) ? readJson(settingsPath, '.skilly/config.json') : {};

/** The Bundle layer, empty when the repo names no Bundle or has no Bundle configs to read. */
const readBundleLayer = (names) => {
  if (!names.length) return {};
  const bundlesDir = findBundlesDir(root);
  if (!bundlesDir) {
    console.error(`verify: no Bundle configs in .skilly/engine/bundles/ or bundles/, so the Bundle steps of ${names.join(', ')} do not run.`);
    return {};
  }
  let result;
  try {
    result = bundleSteps(names, bundlesDir);
  } catch (error) {
    return fail(error.message);
  }
  for (const name of result.unknown)
    console.error(`verify: no config for Bundle ${name} in ${relative(root, bundlesDir)}/, so its steps do not run.`);
  return result.layer;
};

const overridePath = join(root, '.skilly', 'verify.json');
const config = mergeConfig(
  mergeConfig(readJson(DEFAULTS_PATH, 'the verify defaults'), readBundleLayer(settings.bundles ?? [])),
  existsSync(overridePath) ? readJson(overridePath, '.skilly/verify.json') : {},
);
if (process.argv.includes('--config')) {
  process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
  process.exit(0);
}

const tier = settings.tier ?? 'sandbox';
if (!TIERS.includes(tier)) fail(`unknown tier ${JSON.stringify(tier)} in .skilly/config.json, tiers are ${TIERS.join(', ')}.`);

const stages = config.stages ?? {};
const stageName = process.argv[2];
const stage = Object.hasOwn(stages, stageName ?? '') ? stages[stageName] : undefined;
if (!stage) {
  fail(`unknown stage ${JSON.stringify(stageName ?? null)}.`, `known stages are ${Object.keys(stages).join(', ')}.`);
}

const steps = [];
const skipped = [];

/** Every step of a stage, the steps of whatever it extends first, minus the inherited ones it names in `without`. */
const stepsFor = (name, seen = []) => {
  if (seen.includes(name)) return fail(`stage ${name} extends itself.`);
  const found = stages[name];
  if (!found) return fail(`stage ${seen.at(-1)} extends unknown stage ${name}.`);
  const inherited = found.extends ? stepsFor(found.extends, [...seen, name]) : [];
  const without = found.without ?? [];
  const kept = inherited.filter((step) => {
    if (!without.includes(step.name)) return true;
    skipped.push({ name: step.name, reason: `stage ${name} runs without it` });
    return false;
  });
  return [...kept, ...(found.steps ?? [])];
};

const meets = (needed) => TIERS.indexOf(tier) >= TIERS.indexOf(needed);
const validateTier = (needed, where) => {
  if (!TIERS.includes(needed)) fail(`unknown tier ${JSON.stringify(needed)} on ${where}, tiers are ${TIERS.join(', ')}.`);
};

// Listed on the first step with `paths`, once. Null when git cannot list them: then every step runs.
let changedFiles;
const isPathChanged = (paths) => {
  if (changedFiles === undefined) changedFiles = listChangedFiles(`origin/${defaultBranch(root)}`, root);
  return changedFiles === null || findMatch(paths, changedFiles) !== undefined;
};

// Read on the first step with `dependency`, once. A tool such as vitest needs no config file, so
// the package.json entry is what says the repo has it.
let declaredPackages;
const hasDependency = (name) => {
  if (declaredPackages === undefined) {
    const packagePath = join(root, 'package.json');
    const { dependencies, devDependencies } = existsSync(packagePath) ? readJson(packagePath, 'package.json') : {};
    declaredPackages = { ...dependencies, ...devDependencies };
  }
  return Object.hasOwn(declaredPackages, name);
};

if (stage.tier !== undefined) validateTier(stage.tier, `stage ${stageName}`);
const stageBlocked = stage.tier !== undefined && !meets(stage.tier);

if (stageBlocked) {
  skipped.push({ name: stageName, reason: `stage needs ${stage.tier}, repo is ${tier}` });
} else {
  const runnable = [];
  for (const step of stepsFor(stageName)) {
    if (step.tier !== undefined) validateTier(step.tier, `step ${step.name}`);
    if (step.tier !== undefined && !meets(step.tier)) {
      skipped.push({ name: step.name, reason: `needs ${step.tier}, repo is ${tier}` });
      continue;
    }
    if (step.target !== undefined && !existsSync(join(root, step.target))) {
      skipped.push({ name: step.name, reason: `no ${step.target}` });
      continue;
    }
    if (step.dependency !== undefined && !hasDependency(step.dependency)) {
      skipped.push({ name: step.name, reason: `no ${step.dependency} in package.json` });
      continue;
    }
    if (stage.changedOnly && step.paths !== undefined && !isPathChanged(step.paths)) {
      skipped.push({ name: step.name, reason: 'none of its paths changed' });
      continue;
    }
    runnable.push(step);
  }
  // Only a step that runs replaces another: a replacement that was skipped covers nothing.
  for (const step of runnable) {
    const replacement = runnable.find((other) => other.replaces === step.name);
    if (replacement) skipped.push({ name: step.name, reason: `replaced by ${replacement.name}` });
    else steps.push(step);
  }
}

if (process.argv.includes('--steps')) {
  process.stdout.write(`${JSON.stringify({ stage: stageName, tier, steps, skipped }, null, 2)}\n`);
  process.exit(0);
}

if (stageBlocked) {
  process.stdout.write(`stage ${stageName} needs ${stage.tier}, repo is ${tier}: nothing to run\n`);
  process.exit(0);
}


const startedAt = Date.now();
const results = [];

// A git hook exports GIT_DIR and friends, which point every `git` a step runs at the hook's
// repo, temp repos included. Steps run as they would from a shell.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
// Resolved once, so every step agrees on the default branch.
env.DEFAULT_BRANCH = defaultBranch(root);

for (const step of steps) {
  const stepStartedAt = Date.now();
  process.stdout.write(`\n> ${stageName}: ${step.name}\n`);
  // VERIFY_STEP hands a step script its own config, e.g. the audit step's accept list.
  const result = spawnSync(step.run, { cwd: root, shell: true, stdio: 'inherit', env: { ...env, VERIFY_STEP: JSON.stringify(step) } });
  const seconds = (Date.now() - stepStartedAt) / 1000;
  // A step killed by a signal has no status, and still counts as red.
  const status = result.status ?? 1;
  results.push({ name: step.name, seconds, status, issueLabels: step.issueLabels ?? [] });
  if (status !== 0) {
    console.error(`\nFAILED ${stageName}: ${step.name}, after ${seconds.toFixed(1)}s`);
    console.error(`  ${step.run}`);
    // `why` reaches the reader at the moment the step goes red, which is the moment they are
    // least likely to go looking for it.
    if (step.why) console.error(`  ${step.why}`);
  }
}

const resultsAt = process.argv.indexOf('--results');
if (resultsAt !== -1) writeFileSync(process.argv[resultsAt + 1], `${JSON.stringify(results, null, 2)}\n`);

const total = (Date.now() - startedAt) / 1000;
const red = results.filter(({ status }) => status !== 0);
process.stdout.write(
  red.length
    ? `\n${stageName} failed: ${red.length} of ${results.length} steps red in ${total.toFixed(1)}s\n`
    : `\n${stageName} passed in ${total.toFixed(1)}s\n`,
);
for (const { name, seconds, status } of results) {
  const label = status === 0 ? 'ok' : 'FAILED';
  process.stdout.write(`  ${label.padEnd(6)} ${seconds.toFixed(1).padStart(6)}s  ${name}\n`);
}
for (const skip of skipped) process.stdout.write(`  skip   ${skip.name}: ${skip.reason}\n`);

if (typeof stage.budgetSeconds === 'number' && total > stage.budgetSeconds) {
  const lines = [
    '',
    `WARNING: ${stageName} took ${total.toFixed(1)}s, over its ${stage.budgetSeconds}s budget.`,
    'This is a warning. It never fails the gate.',
  ];
  if (config.budgetTicket) lines.push(`Split the stage: ${config.budgetTicket}`);
  process.stdout.write(`${lines.join('\n')}\n\n`);
}

if (red.length) process.exit(red[0].status);
