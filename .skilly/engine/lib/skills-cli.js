import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { SKILLS_CLI_VERSION } from './constants.js';

// The one adapter around the skills CLI. Every invocation is pinned here and
// every result is read from the lock file — `add` output is unparseable and
// exit codes lie, so the lock file is the only truth.

export function readLock(cwd) {
  const path = join(cwd, 'skills-lock.json');
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')).skills ?? {}) : {};
}

function invoke(cwd, args) {
  // CI hands the skills CLI a read token scoped to the private-source owner
  // while gh/git keep the repo-scoped write token (SKILLY_SKILLS_TOKEN).
  const env = process.env.SKILLY_SKILLS_TOKEN
    ? { ...process.env, GH_TOKEN: process.env.SKILLY_SKILLS_TOKEN }
    : process.env;
  const result = spawnSync('npx', ['-y', `skills@${SKILLS_CLI_VERSION}`, ...args], { cwd, stdio: 'inherit', env });
  if (result.error) throw new Error(`failed to run npx skills: ${result.error.message}`);
}

export function add(cwd, source, skills) {
  invoke(cwd, ['add', source, '-s', ...skills, '-y', '--agent', 'claude-code']);
  const lock = readLock(cwd);
  return {
    added: skills.filter((name) => name in lock),
    missing: skills.filter((name) => !(name in lock)),
  };
}

export function remove(cwd, skills) {
  invoke(cwd, ['remove', ...skills, '-y']);
  const lock = readLock(cwd);
  return {
    removed: skills.filter((name) => !(name in lock)),
    left: skills.filter((name) => name in lock),
  };
}

// Reinstalls straight from the lock, so it also heals deleted skill folders.
export function update(cwd) {
  const before = readLock(cwd);
  invoke(cwd, ['update', '-p', '-y']);
  const after = readLock(cwd);
  const changed = Object.keys(after).filter((name) => JSON.stringify(before[name]) !== JSON.stringify(after[name]));
  return { changed };
}
