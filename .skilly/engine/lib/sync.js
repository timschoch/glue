import { createHash } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { HUB_REPO } from './constants.js';
import { addFormatterIgnores } from './formatter-ignores.js';
import { HOOK_PATHS, writeHooks } from './hooks.js';
import * as lockfile from './lockfile.js';
import { MANAGED_PATHS, writeManagedFiles } from './managed-files.js';
import { matchName } from './match.js';
import { validateSettings } from './repo-settings.js';
import { resolveBundles, sourceRepo } from './resolve.js';
import { ownSkills, selfSource } from './self-source.js';
import * as skillsCli from './skills-cli.js';
import * as skillyFile from './skilly-file.js';
import { updateRules } from './update-rules.js';

// The Sync module (ADR-0008 decisions 17 to 19). A checkout, its
// .skilly/config.json and one Release snapshot go in. Skills, Router rules,
// the Engine copy, the Managed files and the skilly hook entries come out, plus
// the Sync report. It never prompts and never commits: callers own commit, push
// and the Sync PR.
const ENGINE_DIR = join('.skilly', 'engine');
const ENGINE_RECORD = join('.skilly', 'engine.json');
const GITATTRIBUTES_LINE = '.skilly/engine/** linguist-generated=true';
// Every path the Sync may write. The Sync report diffs these before and after.
const OWNED_PATHS = [
  '.agents',
  '.claude/skills',
  '.claude/rules',
  '.skilly',
  'skills-lock.json',
  '.gitattributes',
  ...MANAGED_PATHS,
  ...HOOK_PATHS,
];
const FORMATTER_FILES = ['.prettierignore', 'biome.json', 'biome.jsonc'];

// path -> content, for every file under the given paths. A symlink is its
// target: skill folders are links, and the Sync must not follow them twice.
function fileContents(root, paths) {
  const contents = new Map();
  const visit = (path) => {
    const full = join(root, path);
    if (!existsSync(full) && !isLink(full)) return;
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) contents.set(path, `link:${readlinkSync(full)}`);
    else if (stat.isDirectory()) for (const entry of readdirSync(full).sort()) visit(join(path, entry));
    else contents.set(path, readFileSync(full, 'utf8'));
  };
  for (const path of paths) visit(path);
  return contents;
}

function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

// The hash of a folder: every file's relative path and content, in path order.
export function folderHash(dir) {
  const hash = createHash('sha256');
  for (const [path, content] of fileContents(dir, ['.'])) hash.update(`${relative('.', path)}\0${content}\0`);
  return hash.digest('hex');
}

// recorded: the hash the last Sync wrote. actual: the hash of the folder now.
// edited: the folder no longer matches its record (ADR-0008 decision 10).
export function engineState(cwd) {
  const record = join(cwd, ENGINE_RECORD);
  const recorded = existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')).hash : null;
  const actual = existsSync(join(cwd, ENGINE_DIR)) ? folderHash(join(cwd, ENGINE_DIR)) : null;
  return { recorded, actual, edited: recorded !== null && recorded !== actual };
}

// A Sync never overwrites an edited Engine: the owner chose to run it.
function refuseEditedEngine(cwd) {
  if (engineState(cwd).edited) {
    throw new Error(`${ENGINE_DIR}/ was edited by hand — restore it with \`git checkout -- ${ENGINE_DIR}\` first`);
  }
}

// Copy the Release's Engine into .skilly/engine/ and record its hash.
// The Hub runs its Engine from engine/, so it gets no copy.
// The copy carries the config.json of every Bundle of the Release, next to the
// Engine in the snapshot: verify reads the Bundle steps from it.
export function writeEngine(cwd, engineDir) {
  if (selfSource(cwd)?.toLowerCase() === HUB_REPO) return null;
  refuseEditedEngine(cwd);
  rmSync(join(cwd, ENGINE_DIR), { recursive: true, force: true });
  cpSync(engineDir, join(cwd, ENGINE_DIR), { recursive: true });
  const bundlesDir = join(engineDir, '..', 'bundles');
  for (const bundle of readdirSync(bundlesDir).filter((name) => existsSync(join(bundlesDir, name, 'config.json')))) {
    cpSync(join(bundlesDir, bundle, 'config.json'), join(cwd, ENGINE_DIR, 'bundles', bundle, 'config.json'));
  }
  const hash = folderHash(join(cwd, ENGINE_DIR));
  writeFileSync(join(cwd, ENGINE_RECORD), JSON.stringify({ hash }, null, 2) + '\n');
  const attributes = join(cwd, '.gitattributes');
  const lines = existsSync(attributes) ? readFileSync(attributes, 'utf8') : '';
  if (!lines.split('\n').includes(GITATTRIBUTES_LINE)) {
    appendFileSync(attributes, `${lines && !lines.endsWith('\n') ? '\n' : ''}${GITATTRIBUTES_LINE}\n`);
  }
  return hash;
}

// The skills the config asks for, by source. A Hub skill installs from the
// Release tag, so the skill matches the Engine that runs next to it.
function wantedSkills(config, bundlesDir, self, release) {
  const { bundles, sources } = resolveBundles(config.bundles, bundlesDir, self);
  for (const name of config.skills ?? []) {
    const match = matchName(name, bundlesDir);
    if (match?.type !== 'skill') throw new Error(`no skill named "${name}" in Release ${release}`);
    if (!sources.has(match.source)) sources.set(match.source, new Set());
    sources.get(match.source).add(name);
  }
  const pinned = new Map();
  for (const [source, skills] of sources) {
    pinned.set(sourceRepo(source) === HUB_REPO && release ? `${source}#${release}` : source, skills);
  }
  return { bundles, sources: pinned };
}

// repo: the Consumer's "owner/repo". Given, the report carries the repo
// settings drift (ADR-0009 decision 8); a local Sync makes no GitHub call.
export function sync({
  cwd,
  snapshot: { dir, release },
  skills = skillsCli,
  repo = null,
  refreshLock = lockfile.refreshLock,
}) {
  const bundlesDir = join(dir, 'bundles');
  const config = skillyFile.read(cwd);
  refuseEditedEngine(cwd);
  const before = fileContents(cwd, [...OWNED_PATHS, ...FORMATTER_FILES]);
  const isBundle = (name) => existsSync(join(bundlesDir, name, 'config.json'));

  // Bundles the Release dropped leave the config; the report says so.
  const droppedBundles = config.bundles.filter((name) => !isBundle(name));
  config.bundles = config.bundles.filter(isBundle);

  const self = { selfSource: selfSource(cwd), ownSkills: ownSkills(cwd) };
  const wanted = wantedSkills(config, bundlesDir, self, release);
  const wantedNames = new Set([...wanted.sources.values()].flatMap((names) => [...names]));

  // A lock entry from a source no Bundle uses is a hand pin: never touched.
  const allSources = resolveBundles(readdirSync(bundlesDir).filter(isBundle), bundlesDir).sources;
  const bundledSources = new Set([...allSources.keys(), ...wanted.sources.keys()].map((source) => sourceRepo(source)));
  const lock = skills.readLock(cwd);
  const removed = Object.keys(lock)
    .filter((name) => !wantedNames.has(name) && bundledSources.has(sourceRepo(lock[name].source)))
    .sort();
  if (removed.length) {
    const { left } = skills.remove(cwd, removed);
    if (left.length) throw new Error(`skills remove left these pinned: ${left.join(', ')}`);
  }

  const added = [];
  for (const [source, names] of wanted.sources) {
    const missing = [...names].filter((name) => !(name in lock)).sort();
    if (!missing.length) continue;
    const result = skills.add(cwd, source, missing);
    if (result.missing.length) throw new Error(`skills add left these uninstalled: ${result.missing.join(', ')}`);
    added.push(...result.added);
  }
  const { changed } = skills.update(cwd);

  // A new Release moves the installed Hub skills to it. This runs after the
  // update, which would move them to the Hub's main branch.
  const updated = new Set(changed);
  if (release && release !== config.hub) {
    for (const [source, names] of wanted.sources) {
      const installed = [...names].filter((name) => name in lock).sort();
      if (sourceRepo(source.split('#')[0]) !== HUB_REPO || !installed.length) continue;
      const result = skills.add(cwd, source, installed);
      if (result.missing.length) throw new Error(`skills add left these uninstalled: ${result.missing.join(', ')}`);
      for (const name of installed) updated.add(name);
    }
  }

  // Router rules: the Release's Bundles not configured go, then every
  // configured Bundle and installed skill is written fresh.
  for (const bundle of readdirSync(bundlesDir).filter(isBundle)) {
    if (!wanted.bundles.includes(bundle)) updateRules(cwd, bundle, null);
  }
  for (const skill of removed) updateRules(cwd, skill, null);
  for (const skill of Object.keys(skills.readLock(cwd)).sort()) {
    updateRules(cwd, skill, join(cwd, '.claude', 'skills', skill));
  }
  for (const bundle of wanted.bundles) updateRules(cwd, bundle, join(bundlesDir, bundle));

  const hash = writeEngine(cwd, join(dir, 'engine'));
  writeManagedFiles(cwd, join(dir, 'engine', 'templates'), config.tier);
  writeHooks(cwd, { bundles: wanted.bundles, bundlesDir, refreshLock });
  addFormatterIgnores(cwd);
  skillyFile.write(cwd, { ...config, hub: release ?? config.hub });

  const after = fileContents(cwd, [...OWNED_PATHS, ...FORMATTER_FILES]);
  const files = [...new Set([...before.keys(), ...after.keys()])].filter((path) => before.get(path) !== after.get(path));
  return {
    release: { before: config.hub ?? null, after: release ?? config.hub ?? null },
    bundles: { removed: droppedBundles },
    skills: { added: added.sort(), removed, updated: [...updated].sort() },
    files: files.sort(),
    engine: { hash },
    settings: repo ? validateSettings(repo) : null,
  };
}
