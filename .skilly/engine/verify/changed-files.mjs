// The files a branch changed, and the path patterns that match them. `fullSuiteTriggers` and a
// step's `paths` use the same patterns.
//
// A pattern is a path from the git root: `drizzle/` is everything in that folder, `package.json`
// without a slash is that file name at any depth, `*` stands for any characters inside one path
// segment. Paths come from git, so a checkout under a dot folder matches like any other.
import { spawnSync } from 'node:child_process';

const escapeRegExp = (text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

const matcherFor = (pattern) => {
  const source = pattern.split('*').map(escapeRegExp).join('[^/]*');
  if (pattern.endsWith('/')) return new RegExp(`^${source}`);
  return new RegExp(pattern.includes('/') ? `^${source}$` : `(^|/)${source}$`);
};

/** The first of `files` that one of `patterns` matches, or undefined. */
export function findMatch(patterns, files) {
  for (const pattern of patterns) {
    const matcher = matcherFor(pattern);
    const hit = files.find((path) => matcher.test(path));
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Committed since `base`, then staged and unstaged, then untracked: what `vitest --changed`
 * reads too. Null when git cannot list them, for example without the base.
 */
export function listChangedFiles(base, cwd = process.cwd()) {
  const changed = [];
  // `:/` is the git root: `ls-files` lists only the current folder without it.
  for (const gitArguments of [
    ['diff', '--name-only', `${base}...HEAD`],
    ['diff', '--name-only', 'HEAD'],
    ['ls-files', '--others', '--exclude-standard', '--full-name', ':/'],
  ]) {
    const listed = spawnSync('git', gitArguments, { cwd, encoding: 'utf8' });
    if (listed.status !== 0) return null;
    changed.push(...listed.stdout.split('\n').filter(Boolean));
  }
  return changed;
}
