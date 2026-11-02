import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// The one owner of the Consumer's .skilly/config.json: shape, format, and the
// fact that an empty bundles list is legal (setup writes one before any add).
// Siblings in .skilly/ (verify.json, naming.json) belong to other skills.
export const CONFIG_PATH = join('.skilly', 'config.json');
const LEGACY_PATH = '.skilly.json';
export const TIERS = ['sandbox', 'tool', 'product'];
// The Release a Consumer runs: a Hub tag from release-please, written with its
// "v" by .github/workflows/release.yml. Optional: a config without it loads.
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/;

function validateHub(hub) {
  if (hub === undefined || RELEASE_TAG.test(hub)) return;
  throw new Error(`invalid hub ${JSON.stringify(hub)} in ${CONFIG_PATH} — expected a Release tag such as v1.4.0`);
}

const pathOf = (cwd) => join(cwd, CONFIG_PATH);
const legacyPathOf = (cwd) => join(cwd, LEGACY_PATH);

// Consumers set up before the move carry .skilly.json. Every verb heals one
// silently on its first read. Returns true when it moved a file.
export function migrate(cwd) {
  if (existsSync(pathOf(cwd)) || !existsSync(legacyPathOf(cwd))) return false;
  const parsed = JSON.parse(readFileSync(legacyPathOf(cwd), 'utf8'));
  write(cwd, parsed);
  unlinkSync(legacyPathOf(cwd));
  return true;
}

export const exists = (cwd) => {
  migrate(cwd);
  return existsSync(pathOf(cwd));
};

export function read(cwd) {
  migrate(cwd);
  if (!existsSync(pathOf(cwd))) {
    throw new Error(`no ${CONFIG_PATH} — run \`npx github:timschoch/skilly setup\` first`);
  }
  return parse(readFileSync(pathOf(cwd), 'utf8'));
}

// The config from its file text, such as one read from a git ref.
export function parse(text) {
  const { tier, bundles, review, ...rest } = JSON.parse(text);
  validateHub(rest.hub);
  // Unknown keys round-trip: other skills own their own keys in this file.
  return { ...rest, tier: tier ?? 'sandbox', bundles: bundles ?? [], review: { bots: [], ...review } };
}

export function write(cwd, data) {
  const { tier, bundles, review, ...rest } = data;
  validateHub(rest.hub);
  mkdirSync(dirname(pathOf(cwd)), { recursive: true });
  const out = { tier: tier ?? 'sandbox', bundles: bundles ?? [], review: { bots: [], ...review }, ...rest };
  writeFileSync(pathOf(cwd), JSON.stringify(out, null, 2) + '\n');
}

// Returns true when it created the file; an existing file is left alone.
export function create(cwd) {
  migrate(cwd);
  if (existsSync(pathOf(cwd))) return false;
  write(cwd, { tier: 'sandbox', bundles: [], review: { bots: [] } });
  return true;
}

export function setTier(cwd, tier) {
  if (!TIERS.includes(tier)) throw new Error(`unknown tier "${tier}" — pick one of: ${TIERS.join(', ')}`);
  const data = read(cwd);
  if (data.tier === tier) return false;
  write(cwd, { ...data, tier });
  return true;
}

export function addBundle(cwd, name) {
  const data = read(cwd);
  if (data.bundles.includes(name)) return false;
  data.bundles.push(name);
  write(cwd, data);
  return true;
}

export function removeBundle(cwd, name) {
  const data = read(cwd);
  if (!data.bundles.includes(name)) return false;
  write(cwd, { ...data, bundles: data.bundles.filter((bundle) => bundle !== name) });
  return true;
}
