// Refuses a direct push to a protected branch and a pushed branch with a bad
// name; faster and clearer than the server-side ruleset round trip. Wire as the
// pre-push hook; git feeds one line per ref on stdin:
// <local ref> <local sha> <remote ref> <remote sha>.
// The name is the remote branch's, not HEAD's: that is what lands on GitHub.
import { readFileSync } from 'node:fs';
import { validateBranchName } from './check-branch-name.mjs';
import { defaultBranch } from './default-branch.mjs';

// The trunk is detected, not configured — this file is synced from the hub and
// a local edit dies at the next sync.
const PROTECTED = [...new Set(['main', defaultBranch()])];

let input = '';
try {
  input = readFileSync(0, 'utf8');
} catch {
  process.exit(0); // no stdin, nothing to check
}

const refs = input.split('\n').map((line) => {
  const [localRef, , remoteRef = ''] = line.trim().split(/\s+/);
  return { localRef, remoteRef };
});

const blocked = refs.flatMap(({ remoteRef }) => PROTECTED.filter((branch) => remoteRef === `refs/heads/${branch}`));

if (blocked.length) {
  console.error(
    [
      `Direct push to ${blocked.join(' and ')} is blocked.`,
      '',
      'Protected branches change through a reviewed pull request only:',
      '  git switch -c <type>/<name>  ->  push  ->  gh pr create',
    ].join('\n'),
  );
  process.exit(1);
}

// A delete removes the name from GitHub, so a bad name may go.
const nameErrors = refs
  .filter(({ localRef, remoteRef }) => localRef !== '(delete)' && remoteRef.startsWith('refs/heads/'))
  .map(({ remoteRef }) => validateBranchName(remoteRef.slice('refs/heads/'.length)))
  .filter(Boolean);

if (nameErrors.length) {
  console.error(nameErrors.join('\n\n'));
  process.exit(1);
}
