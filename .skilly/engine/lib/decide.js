import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HUB_OWNERS, HUB_REPO } from './constants.js';
import { ghCli } from './delivery.js';
import { detectPackageManager, listManagedSecrets } from './managed-files.js';
import { validateSettings } from './repo-settings.js';
import { resolveBundles } from './resolve.js';
import { selfSource } from './self-source.js';
import { hubInvite } from './setup.js';
import * as skillyFile from './skilly-file.js';

// The decide phase of Setup (ADR-0009 decisions 1, 2 and 4). The setup-project
// chat calls these scripts for every check and every write; each also runs
// alone from a terminal. snapshotDir is a Release snapshot: bundles/ and
// engine/templates/.

const readBundleConfigs = (snapshotDir) => {
  const bundlesDir = join(snapshotDir, 'bundles');
  return readdirSync(bundlesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(bundlesDir, entry.name, 'config.json')))
    .map(({ name }) => ({ name, config: JSON.parse(readFileSync(join(bundlesDir, name, 'config.json'), 'utf8')) }))
    .sort((left, right) => left.name.localeCompare(right.name));
};

// Every package name in package.json, sorted.
function listDependencies(cwd) {
  const path = join(cwd, 'package.json');
  if (!existsSync(path)) return [];
  const packageJson = JSON.parse(readFileSync(path, 'utf8'));
  const fields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
  return [...new Set(fields.flatMap((field) => Object.keys(packageJson[field] ?? {})))].sort();
}

// A hint names one package, or a scope or prefix with a trailing `*`.
const matchesHint = (dependency, hint) =>
  hint.endsWith('*') ? dependency.startsWith(hint.slice(0, -1)) : dependency === hint;

// The reasons a Bundle's detect hints give for ticking it.
function listHintReasons(cwd, detect = {}, dependencies) {
  const reasons = [];
  if (detect.always) reasons.push('every Consumer');
  for (const dependency of dependencies)
    if ((detect.dependencies ?? []).some((hint) => matchesHint(dependency, hint)))
      reasons.push(`dependency ${dependency}`);
  for (const file of detect.files ?? []) if (existsSync(join(cwd, file))) reasons.push(`file ${file}`);
  return reasons;
}

// Every Bundle of the Release, by name. ticked: its detect hints match the
// repo, or .skilly/config.json already holds it. reasons say why.
export function listBundles({ cwd, snapshotDir }) {
  const chosen = skillyFile.exists(cwd) ? skillyFile.read(cwd).bundles : [];
  const dependencies = listDependencies(cwd);
  return readBundleConfigs(snapshotDir).map(({ name, config }) => {
    const reasons = chosen.includes(name) ? ['in .skilly/config.json'] : [];
    reasons.push(...listHintReasons(cwd, config.detect, dependencies));
    return { name, ticked: reasons.length > 0, reasons };
  });
}

// The dependencies no Bundle's detect hint covers: the stack the Release has
// no skills for yet. The chat names them to the person.
export function listUnmatchedDependencies({ cwd, snapshotDir }) {
  const hints = readBundleConfigs(snapshotDir).flatMap(({ config }) => config.detect?.dependencies ?? []);
  return listDependencies(cwd).filter((dependency) => !hints.some((hint) => matchesHint(dependency, hint)));
}

// Writes the person's answers into .skilly/config.json. The other keys stay.
// An unknown tier or Bundle throws before any write.
export function setConfig({ cwd, snapshotDir, tier, bundles }) {
  if (!skillyFile.TIERS.includes(tier))
    throw new Error(`unknown tier "${tier}" — pick one of: ${skillyFile.TIERS.join(', ')}`);
  resolveBundles(bundles, join(snapshotDir, 'bundles'));
  const current = skillyFile.exists(cwd) ? skillyFile.read(cwd) : {};
  skillyFile.write(cwd, { ...current, tier, bundles });
}

// The secrets a Consumer needs: the Managed files of its tier, then its Bundles'.
function listNeededSecrets(snapshotDir, { tier, bundles }) {
  const bundlesDir = join(snapshotDir, 'bundles');
  const fromBundles = resolveBundles(bundles, bundlesDir).bundles.flatMap(
    (name) => JSON.parse(readFileSync(join(bundlesDir, name, 'config.json'), 'utf8')).secrets ?? [],
  );
  return [...new Set([...listManagedSecrets(join(snapshotDir, 'engine', 'templates'), tier), ...fromBundles])].sort();
}

const attempt = (action) => {
  try {
    return { value: action() };
  } catch (error) {
    return { error: error.message };
  }
};

// The preflight (ADR-0009 decision 2): every check the apply phase needs to
// pass, read-only. Returns [{ check, ok, detail }]. A check that needs a
// failed one is left out. Any red check stops Setup before the apply phase.
export function listPreflightChecks({ cwd, snapshotDir, repo = selfSource(cwd), gh = ghCli(cwd) }) {
  const checks = [];
  const add = (check, ok, detail) => checks.push({ check, ok, detail });

  const config = attempt(() => {
    const value = skillyFile.read(cwd);
    resolveBundles(value.bundles, join(snapshotDir, 'bundles'));
    return value;
  });
  add('config', !config.error, config.error ?? `tier ${config.value.tier}, Bundles ${config.value.bundles.join(', ') || 'none'}`);

  const login = attempt(() => JSON.parse(gh(['api', 'user'])).login);
  add('gh login', !login.error, login.error ? `${login.error}. Run: gh auth login` : login.value);
  if (!login.error) {
    const invite = hubInvite(gh);
    add('Hub read access', !invite, invite ? `this gh login cannot read ${HUB_REPO}. The Hub owner runs: ${invite}` : HUB_REPO);
  }

  add(
    'repo',
    Boolean(repo),
    repo ?? 'no GitHub origin. Create the repo, private by default: gh repo create <owner>/<name> --private --source . --push',
  );
  if (repo) {
    // A person's gh token cannot list App installs, so the allowlist stands in:
    // the App is installed on each account on it, with "All repositories".
    const owner = repo.split('/')[0];
    const isSynced = HUB_OWNERS.some((name) => name.toLowerCase() === owner.toLowerCase());
    add('skilly App', isSynced, isSynced ? owner : `the Hub syncs only ${HUB_OWNERS.join(', ')}, not ${owner}`);
  }

  if (repo && !login.error) {
    const { unavailable } = validateSettings(repo);
    if (!unavailable.length) add('repo settings', true, 'every setting readable');
    for (const { setting, reason } of unavailable) add('repo settings', false, `${setting}: ${reason}`);

    if (!config.error) {
      const needed = listNeededSecrets(snapshotDir, config.value);
      const have = needed.length
        ? attempt(() => JSON.parse(gh(['api', `repos/${repo}/actions/secrets?per_page=100`])).secrets.map(({ name }) => name))
        : { value: [] };
      const missing = needed.filter((name) => !have.value?.includes(name));
      if (have.error) add('secrets', false, have.error);
      else if (missing.length)
        add('secrets', false, `missing ${missing.join(', ')}. Set each: gh secret set <name> --repo ${repo}`);
      else add('secrets', true, needed.join(', ') || 'none needed');
    }
  }

  const installer = attempt(() => detectPackageManager(cwd));
  add('package manager', !installer.error, installer.error ?? installer.value);
  return checks;
}
