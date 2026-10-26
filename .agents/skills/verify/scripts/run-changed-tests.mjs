#!/usr/bin/env node
// Runs a test command on the tests the diff reaches, or on the full suite when the diff holds a
// file that no test imports. `vitest --changed` follows imports only. A lockfile, a test config
// or a migration changes what every test sees, and no test imports it.
//
// The triggers are `fullSuiteTriggers` in the merged verify config. A trigger is a path from the
// git root: `drizzle/` is everything in that folder, `package.json` without a slash is that file
// name at any depth, `*` stands for any characters inside one path segment. Paths come from git,
// so a checkout under a dot folder matches like any other. Vitest's own `forceRerunTriggers` do
// not: their `**` skips a dot segment.
//
// Usage:
//   node .agents/skills/verify/scripts/run-changed-tests.mjs <base> <command...>
//
// Runs `<command> --changed <base>`, or `<command>` alone when a trigger is in the diff.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [base, ...command] = process.argv.slice(2);
if (!base || command.length === 0) {
  console.error('run-changed-tests: usage: run-changed-tests.mjs <base> <command...>');
  process.exit(2);
}

const verifyScript = join(dirname(fileURLToPath(import.meta.url)), 'verify.mjs');
const config = spawnSync(process.execPath, [verifyScript, '--config'], { encoding: 'utf8' });
if (config.status !== 0) {
  process.stderr.write(config.stderr);
  process.exit(config.status ?? 2);
}
const triggers = JSON.parse(config.stdout).fullSuiteTriggers ?? [];

const escapeRegExp = (text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const matcherFor = (trigger) => {
  const pattern = trigger.split('*').map(escapeRegExp).join('[^/]*');
  if (trigger.endsWith('/')) return new RegExp(`^${pattern}`);
  return new RegExp(trigger.includes('/') ? `^${pattern}$` : `(^|/)${pattern}$`);
};

/** Why the full suite must run, or null when the changed tests are enough. */
const fullSuiteReason = () => {
  const changed = [];
  // Committed since the base, then staged and unstaged, then untracked: what `--changed` reads too.
  // `:/` is the git root: `ls-files` lists only the current folder without it.
  for (const gitArguments of [
    ['diff', '--name-only', `${base}...HEAD`],
    ['diff', '--name-only', 'HEAD'],
    ['ls-files', '--others', '--exclude-standard', '--full-name', ':/'],
  ]) {
    const listed = spawnSync('git', gitArguments, { encoding: 'utf8' });
    if (listed.status !== 0) return `git cannot list the changes against ${base}`;
    changed.push(...listed.stdout.split('\n').filter(Boolean));
  }
  for (const trigger of triggers) {
    const matcher = matcherFor(trigger);
    const hit = changed.find((path) => matcher.test(path));
    if (hit) return `${hit} changed`;
  }
  return null;
};

const reason = fullSuiteReason();
if (reason) process.stdout.write(`full suite: ${reason}\n`);
const [program, ...programArguments] = [...command, ...(reason ? [] : ['--changed', base])];
const result = spawnSync(program, programArguments, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
