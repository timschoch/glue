// The middle layer of the verify plan: the verify steps of the Bundles a Consumer names in
// `.skilly/config.json`, includes followed. verify.mjs merges it between the Engine defaults
// and `.skilly/verify.json`.
//
// A Bundle declares its steps in its config.json:
//   "verify": { "fullSuiteTriggers": [...], "steps": [{ "name", "stage", "run", ... }] }
// Each step names its stage. This module folds the list into the `stages` shape of verify.json,
// so the repo file overrides a Bundle step by name the same way it overrides a default step.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergeConfig } from './merge-config.mjs';

// The Engine carries the Bundle configs of its Release. The Hub keeps them in bundles/.
const BUNDLES_DIRS = [join('.skilly', 'engine', 'bundles'), 'bundles'];

/** The folder that holds the Bundle configs for `root`, or null when the repo has none. */
export const findBundlesDir = (root) =>
  BUNDLES_DIRS.map((directory) => join(root, directory)).find((directory) => existsSync(directory)) ?? null;

/**
 * The Bundle layer for `names`: `{ layer: { fullSuiteTriggers, stages }, unknown }`, includes
 * first, each Bundle once. `unknown` lists the Bundles without a config.json, skipped.
 * Throws on an include cycle or a step without a stage.
 */
export function bundleSteps(names, bundlesDir) {
  const configs = new Map();
  const unknown = [];
  const visiting = [];
  const visit = (name) => {
    if (configs.has(name) || unknown.includes(name)) return;
    const cycleStart = visiting.indexOf(name);
    if (cycleStart !== -1) throw new Error(`Bundle include cycle: ${[...visiting.slice(cycleStart), name].join(' -> ')}`);
    const path = join(bundlesDir, name, 'config.json');
    if (!existsSync(path)) return void unknown.push(name);
    const config = JSON.parse(readFileSync(path, 'utf8'));
    visiting.push(name);
    for (const included of config.includes ?? []) visit(included);
    visiting.pop();
    configs.set(name, config);
  };
  for (const name of names) visit(name);

  let layer = {};
  for (const [name, { verify = {} }] of configs) {
    const { steps = [], ...rest } = verify;
    const stages = {};
    for (const { stage, ...step } of steps) {
      if (typeof stage !== 'string') throw new Error(`step ${step.name} of Bundle ${name} has no stage`);
      (stages[stage] ??= { steps: [] }).steps.push(step);
    }
    layer = mergeConfig(layer, { ...rest, stages });
  }
  return { layer, unknown };
}
