#!/usr/bin/env node
// The one definition of what each gate runs in a Consumer. Git hooks and CI workflows both call a
// stage of this script, so the local gate and the pipeline cannot drift into disagreeing about
// what green means.
//
// Stages are cumulative through `extends` in `.skilly/verify.json`: `push` contains `commit`, `ci`
// contains `push`. Cumulative by construction, so nobody can write a stage that skips a check the
// stage below it runs. `tier` and `target` subtract from that: a repo runs a step only once it is
// big enough for it, and only when the thing the step checks is there.
//
// A budget warns and never fails. A gate that fails on slowness teaches you to bypass the gate,
// and the bypass outlives the slowness. `budgetTicket` in the config says where a stage that has
// outgrown its budget gets split.
//
// Usage:
//   node .agents/skills/verify/scripts/verify.mjs <stage>
//   node .agents/skills/verify/scripts/verify.mjs <stage> --steps    resolved steps as JSON, runs nothing
//
// The flag is `--steps` and not `--print`, because `--print` is node's own eval flag and the
// shell allowlist refuses any command that carries it.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const TIERS = ['sandbox', 'tool', 'product'];

const fail = (...lines) => {
  for (const line of lines) console.error(`verify: ${line}`);
  process.exit(2);
};

/** The nearest ancestor of `from` that carries a `.skilly/verify.json`. */
const findRoot = (from) => {
  let directory = resolve(from);
  for (;;) {
    if (existsSync(join(directory, '.skilly', 'verify.json'))) return directory;
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
if (!root) fail('no .skilly/verify.json in this directory or any parent, so there is no repo to verify.');

const config = readJson(join(root, '.skilly', 'verify.json'), '.skilly/verify.json');
const settingsPath = join(root, '.skilly', 'config.json');
const tier = (existsSync(settingsPath) ? readJson(settingsPath, '.skilly/config.json').tier : null) ?? 'sandbox';
if (!TIERS.includes(tier)) fail(`unknown tier ${JSON.stringify(tier)} in .skilly/config.json, tiers are ${TIERS.join(', ')}.`);

const stages = config.stages ?? {};
const stageName = process.argv[2];
const stage = Object.hasOwn(stages, stageName ?? '') ? stages[stageName] : undefined;
if (!stage) {
  fail(`unknown stage ${JSON.stringify(stageName ?? null)}.`, `known stages are ${Object.keys(stages).join(', ')}.`);
}

/** Every step of a stage, the steps of whatever it extends first. */
const stepsFor = (name, seen = []) => {
  if (seen.includes(name)) return fail(`stage ${name} extends itself.`);
  const found = stages[name];
  if (!found) return fail(`stage ${seen.at(-1)} extends unknown stage ${name}.`);
  const inherited = found.extends ? stepsFor(found.extends, [...seen, name]) : [];
  return [...inherited, ...(found.steps ?? [])];
};

const meets = (needed) => TIERS.indexOf(tier) >= TIERS.indexOf(needed);
const validateTier = (needed, where) => {
  if (!TIERS.includes(needed)) fail(`unknown tier ${JSON.stringify(needed)} on ${where}, tiers are ${TIERS.join(', ')}.`);
};

const steps = [];
const skipped = [];

if (stage.tier !== undefined) validateTier(stage.tier, `stage ${stageName}`);
const stageBlocked = stage.tier !== undefined && !meets(stage.tier);

if (stageBlocked) {
  skipped.push({ name: stageName, reason: `stage needs ${stage.tier}, repo is ${tier}` });
} else {
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
    steps.push(step);
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

for (const skip of skipped) process.stdout.write(`skip ${skip.name}: ${skip.reason}\n`);

const startedAt = Date.now();
const timings = [];

// A git hook exports GIT_DIR and friends, which point every `git` a step runs at the hook's
// repo, temp repos included. Steps run as they would from a shell.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

for (const step of steps) {
  const stepStartedAt = Date.now();
  process.stdout.write(`\n> ${stageName}: ${step.name}\n`);
  const result = spawnSync(step.run, { cwd: root, shell: true, stdio: 'inherit', env });
  const seconds = (Date.now() - stepStartedAt) / 1000;
  timings.push({ name: step.name, seconds });
  if (result.status !== 0) {
    console.error(`\nFAILED ${stageName}: ${step.name}, after ${seconds.toFixed(1)}s`);
    console.error(`  ${step.run}`);
    // `why` reaches the reader at the moment the step goes red, which is the moment they are
    // least likely to go looking for it.
    if (step.why) console.error(`  ${step.why}`);
    process.exit(result.status ?? 1);
  }
}

const total = (Date.now() - startedAt) / 1000;
process.stdout.write(`\n${stageName} passed in ${total.toFixed(1)}s\n`);
for (const timing of timings) {
  process.stdout.write(`  ${timing.seconds.toFixed(1).padStart(6)}s  ${timing.name}\n`);
}

if (typeof stage.budgetSeconds === 'number' && total > stage.budgetSeconds) {
  const lines = [
    '',
    `WARNING: ${stageName} took ${total.toFixed(1)}s, over its ${stage.budgetSeconds}s budget.`,
    'This is a warning. It never fails the gate.',
  ];
  if (config.budgetTicket) lines.push(`Split the stage: ${config.budgetTicket}`);
  process.stdout.write(`${lines.join('\n')}\n\n`);
}
