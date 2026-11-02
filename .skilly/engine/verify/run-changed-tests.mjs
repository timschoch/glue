#!/usr/bin/env node
// Runs a test command on the tests the diff reaches, or on the full suite when the diff holds a
// file that no test imports. `vitest --changed` follows imports only. A lockfile, a test config
// or a migration changes what every test sees, and no test imports it.
//
// The triggers are `fullSuiteTriggers` in the merged verify config, patterns as in
// changed-files.mjs. Vitest's own `forceRerunTriggers` do not match a checkout under a dot
// folder: their `**` skips a dot segment.
//
// Usage:
//   node .skilly/engine/verify/run-changed-tests.mjs <base> <command...>
//
// Runs `<command> --changed <base>`, or `<command>` alone when a trigger is in the diff.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMatch, listChangedFiles } from './changed-files.mjs';

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

/** Why the full suite must run, or null when the changed tests are enough. */
const fullSuiteReason = () => {
  const changed = listChangedFiles(base);
  if (!changed) return `git cannot list the changes against ${base}`;
  const hit = findMatch(triggers, changed);
  return hit ? `${hit} changed` : null;
};

const reason = fullSuiteReason();
if (reason) process.stdout.write(`full suite: ${reason}\n`);
const [program, ...programArguments] = [...command, ...(reason ? [] : ['--changed', base])];
const result = spawnSync(program, programArguments, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
