#!/usr/bin/env node
// The naming config: defaults from `../references/naming.json`, then one
// `../references/stacks/<bundle>.json` per bundle the consumer picked in
// `.skilly/config.json`, then `.skilly/naming.json` in the consumer repo. The
// naming skill and the naming gate both read every word list from here, so a
// consumer changes a rule once, in one file.
//
// Merge rules: see merge-config.mjs.
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isPlainObject, mergeConfig } from './merge-config.mjs';

const REFERENCES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'references');
const DEFAULTS_PATH = join(REFERENCES_DIR, 'naming.json');
const STACKS_DIR = join(REFERENCES_DIR, 'stacks');
const SKILLY_CONFIG_PATH = join('.skilly', 'config.json');
const DEFAULT_OVERRIDE_PATH = join('.skilly', 'naming.json');
// Consumers set up before the .skilly/ move still keep their overrides here.
const LEGACY_OVERRIDE_PATH = join('docs', 'agents', 'naming.json');

// Every finding rule the gate reports. An `allow` entry names some of them, or "*".
export const RULE_IDS = [
  'file-case',
  'short-word',
  'noise-word',
  'enum',
  'type-prefix',
  'verb-synonym',
  'discriminant',
  'env-shape',
];

function parseJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (failure) {
    throw new Error(`${path} is not valid JSON: ${failure.message}`);
  }
}

function findOverrideFile(root, overridePath) {
  const candidates = overridePath === DEFAULT_OVERRIDE_PATH ? [overridePath, LEGACY_OVERRIDE_PATH] : [overridePath];
  return candidates.map((path) => join(root, path)).find(existsSync);
}

// Stack files for the bundles the consumer picked directly, in that order.
// Bundles pulled in through `includes` are not seen: resolving them needs the
// hub's bundle configs, and a consumer checkout has none.
function stackFiles(root) {
  const path = join(root, SKILLY_CONFIG_PATH);
  if (!existsSync(path)) return [];
  const bundles = parseJsonFile(path).bundles ?? [];
  return bundles.map((bundle) => join(STACKS_DIR, `${bundle}.json`)).filter(existsSync);
}

const oldAllowError = (path) =>
  new Error(
    `${path}: "allow" is an old flat list — run \`npx github:timschoch/skilly update\` to convert it, or write ` +
      '"allow": { "<key>": { "names": ["<regex>"], "rules": "*", "why": "<reason>" } }',
  );

// The merged config for one repo root. A missing override is the normal case.
export function loadNamingConfig(root = process.cwd(), { overridePath = DEFAULT_OVERRIDE_PATH } = {}) {
  let config = mergeConfig(parseJsonFile(DEFAULTS_PATH), {});
  for (const stackFile of stackFiles(root)) config = mergeConfig(config, parseJsonFile(stackFile));
  const overrideFile = findOverrideFile(root, overridePath);
  if (!overrideFile) return config;
  const override = parseJsonFile(overrideFile);
  if (!isPlainObject(override)) throw new Error(`${overrideFile} is not valid JSON: expected an object`);
  if (Array.isArray(override.allow)) throw oldAllowError(overrideFile);
  return mergeConfig(config, override);
}

// `allow` entries turned into one test per finding. Throws on a malformed
// entry and names its key, so a typo fails the gate instead of silencing it.
export function compileAllow(allow = {}) {
  if (!isPlainObject(allow)) throw new Error('"allow" must be an object of named entries');
  return Object.entries(allow).map(([key, entry]) => {
    const fail = (problem) => new Error(`allow "${key}": ${problem}`);
    if (!isPlainObject(entry)) throw fail('must be an object');
    const toPatterns = (field) => {
      if (entry[field] === undefined) return null;
      if (!Array.isArray(entry[field]) || !entry[field].length) throw fail(`"${field}" must be a non-empty list`);
      return entry[field].map((source) => {
        try {
          return new RegExp(source);
        } catch (failure) {
          throw fail(`"${field}" has a bad regex: ${failure.message}`);
        }
      });
    };
    const paths = toPatterns('paths');
    const names = toPatterns('names');
    if (!paths && !names) throw fail('needs "paths", "names" or both');
    const { rules } = entry;
    if (rules !== '*' && (!Array.isArray(rules) || !rules.length)) throw fail('"rules" must be "*" or a non-empty list');
    for (const rule of rules === '*' ? [] : rules) {
      if (!RULE_IDS.includes(rule)) throw fail(`unknown rule "${rule}" — one of ${RULE_IDS.join(', ')}`);
    }
    if (typeof entry.why !== 'string' || !entry.why.trim()) throw fail('"why" must say why the entry exists');
    return { paths, names, rules };
  });
}

// Rewrites an old flat `allow` list in the consumer's override into the keyed
// shape, with the same effect: an old regex matched identifiers and env names
// for every rule but discriminant, and paths for file-case only. Returns the
// file it rewrote, or null. The skilly CLI runs it on every verb.
export function migrateAllow(root) {
  const overrideFile = findOverrideFile(root, DEFAULT_OVERRIDE_PATH);
  if (!overrideFile) return null;
  const override = parseJsonFile(overrideFile);
  if (!isPlainObject(override) || !Array.isArray(override.allow)) return null;
  const why = 'moved from the old allow list — replace with the real reason';
  const nameRules = RULE_IDS.filter((rule) => rule !== 'file-case' && rule !== 'discriminant');
  const allow = {};
  for (const source of override.allow) {
    if (typeof source !== 'string' || source.startsWith('-')) continue;
    allow[source] = { names: [source], rules: nameRules, why };
    allow[`${source} (path)`] = { paths: [source], rules: ['file-case'], why };
  }
  writeFileSync(overrideFile, `${JSON.stringify({ ...override, allow }, null, 2)}\n`);
  return overrideFile;
}

function main(argv) {
  const config = argv.includes('--defaults')
    ? mergeConfig(parseJsonFile(DEFAULTS_PATH), {})
    : loadNamingConfig(process.cwd());
  console.log(JSON.stringify(config, null, 2));
  return 0;
}

// realpath: import.meta.url resolves symlinks, argv[1] does not.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (failure) {
    console.error(failure.message);
    process.exit(1);
  }
}
