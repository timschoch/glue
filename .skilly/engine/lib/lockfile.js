import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { run } from './run.js';

// A Sync that changes package.json refreshes the lockfile, or `npm ci` fails on
// the Sync PR. Only the lockfile, no scripts. Yarn 1 has no lockfile-only flag, so it also
// fills node_modules. The Sync stages named paths only.
const REFRESH_COMMANDS = [
  ['pnpm-lock.yaml', 'pnpm', ['install', '--lockfile-only', '--ignore-scripts']],
  ['yarn.lock', 'yarn', ['install', '--ignore-scripts']],
  ['package-lock.json', 'npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund']],
];
export const LOCKFILES = REFRESH_COMMANDS.map(([file]) => file);

/** Refreshes the lockfile in `cwd`. Returns its name, or null when there is none. */
export function refreshLock(cwd) {
  const found = REFRESH_COMMANDS.find(([file]) => existsSync(join(cwd, file)));
  if (!found) return null;
  const [file, command, args] = found;
  run(command, args, { cwd });
  return file;
}
