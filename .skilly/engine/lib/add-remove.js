import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HUB_REPO } from './constants.js';
import { matchName } from './match.js';
import { run } from './run.js';
import * as skillsCli from './skills-cli.js';
import { CONFIG_PATH, read, write } from './skilly-file.js';
import { sync } from './sync.js';

// Add and Remove (ADR-0008 decision 16): edit .skilly/config.json, then run
// the Sync at the pinned Release. No commit, no push, no PR: the person
// reviews the files and commits them.

export function latestRelease() {
  return run('gh', ['release', 'view', '--repo', HUB_REPO, '--json', 'tagName', '--jq', '.tagName']);
}

// A Release snapshot: a shallow clone of one tag, outside the checkout.
export function cloneRelease(release) {
  const dir = mkdtempSync(join(tmpdir(), 'skilly-release-'));
  run('gh', ['repo', 'clone', HUB_REPO, dir, '--', '--quiet', '--depth', '1', '--branch', release]);
  return { dir, release, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const without = (list, name) => list.filter((entry) => entry !== name);

function edit(verb, names, config, snapshot) {
  const next = { ...config, skills: [...(config.skills ?? [])] };
  for (const name of names) {
    if (verb === 'add') {
      const match = matchName(name, join(snapshot.dir, 'bundles'));
      if (!match) throw new Error(`no Bundle or skill "${name}" in Release ${snapshot.release}`);
      const key = match.type === 'bundle' ? 'bundles' : 'skills';
      if (!next[key].includes(name)) next[key] = [...next[key], name];
    } else if (next.bundles.includes(name)) {
      next.bundles = without(next.bundles, name);
    } else if (next.skills.includes(name)) {
      next.skills = without(next.skills, name);
    } else {
      throw new Error(`"${name}" is not in ${CONFIG_PATH} — nothing to remove`);
    }
  }
  if (!next.skills.length) delete next.skills;
  return next;
}

// Returns the Sync report. A failed Sync puts the config back.
export function runVerb(
  verb,
  names,
  { cwd, skills = skillsCli, latestRelease: newest = latestRelease, fetchSnapshot = cloneRelease },
) {
  if (!names.length) throw new Error(`usage: node .skilly/engine/bin/skilly.js ${verb} <bundle-or-skill...>`);
  const configPath = join(cwd, CONFIG_PATH);
  const config = read(cwd);
  const original = readFileSync(configPath, 'utf8');
  const snapshot = fetchSnapshot(config.hub ?? newest());
  try {
    write(cwd, edit(verb, names, config, snapshot));
    const report = sync({ cwd, snapshot, skills });
    // The Sync sees the config after the edit, so it cannot list it itself.
    const files = new Set(report.files);
    if (readFileSync(configPath, 'utf8') !== original) files.add(CONFIG_PATH);
    return { ...report, files: [...files].sort() };
  } catch (error) {
    writeFileSync(configPath, original);
    throw error;
  } finally {
    snapshot.cleanup();
  }
}
