import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A source is "owner/repo" or a GitHub tree URL pointing into a repo's
// subfolder (deeply nested catalogs the skills CLI cannot discover from the
// repo root). Both reduce to owner/repo for the GitHub API.
export function sourceRepo(source) {
  const url = source.match(/^https:\/\/github\.com\/([^/\s]+\/[^/\s]+)/);
  return url ? url[1] : source;
}

// Resolve bundle names to the union of their sources and gate Rules,
// following `includes` recursively. Cycles, unknown bundles, and Rules
// without a check script are hard errors.
// selfSource ("owner/repo") and ownSkills (see lib/self-source.js) opt into the
// Self-source rule: a skill from the consumer's own repo is dropped when the
// repo already holds it unpinned in .agents/skills. The hub keeps its skills
// in bundles/, so they still install. Hub-side callers omit both and see every
// source: scripts/validate-bundles.mjs, scripts/run-gate.mjs.
export function resolveBundles(names, bundlesDir, { selfSource = null, ownSkills = new Set() } = {}) {
  const configs = new Map(); // bundle name -> config, in resolution order
  const visiting = [];

  const visit = (name) => {
    if (configs.has(name)) return;
    const cycleStart = visiting.indexOf(name);
    if (cycleStart !== -1) {
      throw new Error(`bundle include cycle: ${[...visiting.slice(cycleStart), name].join(' -> ')}`);
    }
    const configPath = join(bundlesDir, name, 'config.json');
    if (!existsSync(configPath)) throw new Error(`unknown bundle "${name}" (no ${configPath})`);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    visiting.push(name);
    for (const included of config.includes ?? []) visit(included);
    visiting.pop();
    configs.set(name, config);
  };
  for (const name of names) visit(name);

  const sources = new Map(); // "owner/repo" -> Set of skill names
  const rules = new Map(); // rule name -> { bundle, script } — the answer callers need, not re-derived
  // GitHub owner/repo is case-insensitive, and the git remote can spell it
  // differently from the bundle config, so this one comparison folds case.
  const selfKey = selfSource ? selfSource.toLowerCase() : null;
  for (const [name, config] of configs) {
    for (const entry of config.sources ?? []) {
      const isSelf = selfKey && sourceRepo(entry.source).toLowerCase() === selfKey;
      for (const skill of entry.skills ?? []) {
        if (isSelf && ownSkills.has(skill)) continue;
        if (!sources.has(entry.source)) sources.set(entry.source, new Set());
        sources.get(entry.source).add(skill);
      }
    }
    for (const rule of config.rules ?? []) {
      if (rules.has(rule)) continue;
      const script = join(bundlesDir, name, 'rules', `${rule}.sh`);
      if (!existsSync(script)) throw new Error(`rule "${rule}" declared by "${name}" has no ${script}`);
      rules.set(rule, { bundle: name, script });
    }
  }
  return { bundles: [...configs.keys()], sources, rules };
}
