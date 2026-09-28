// Refuses a direct push to a protected branch; faster and clearer than the
// server-side ruleset round trip. Wire as the pre-push hook; git feeds one line
// per ref on stdin: <local ref> <local sha> <remote ref> <remote sha>.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// The trunk is detected, not configured — this file is synced from the hub and
// a local edit dies at the next sync.
function defaultBranch() {
  try {
    return execFileSync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { encoding: 'utf8' })
      .trim()
      .replace(/^origin\//, '');
  } catch {
    return 'main';
  }
}

const PROTECTED = [...new Set(['main', defaultBranch()])];

let input = '';
try {
  input = readFileSync(0, 'utf8');
} catch {
  process.exit(0); // no stdin, nothing to check
}

const blocked = input
  .split('\n')
  .map((line) => line.trim().split(/\s+/)[2])
  .flatMap((ref) => PROTECTED.filter((branch) => ref === `refs/heads/${branch}`));

if (!blocked.length) process.exit(0);

console.error(
  [
    `Direct push to ${blocked.join(' and ')} is blocked.`,
    '',
    'Protected branches change through a reviewed pull request only:',
    '  git switch -c <type>/<name>  ->  push  ->  gh pr create',
  ].join('\n'),
);
process.exit(1);
