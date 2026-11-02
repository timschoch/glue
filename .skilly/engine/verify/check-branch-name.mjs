// Conventional Branch gate, zero-dependency. A default `push` step of the
// verify skill, so CI runs it too:
//   node .skilly/engine/verify/check-branch-name.mjs
// Locally it reads the checked-out branch. In CI HEAD is detached, so it reads
// the PR's head branch from GITHUB_HEAD_REF; a push build has neither and passes.
// check-push-branch.mjs imports validateBranchName for each pushed branch.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultBranch } from './default-branch.mjs';

const TYPES = ['feat', 'fix', 'hotfix', 'epic', 'release', 'chore', 'docs', 'ci', 'research'];
const NAME = new RegExp(`^(${TYPES.join('|')})/[a-z0-9]+([.-][a-z0-9]+)*$`);
// Bots name their own branches and cannot be told otherwise.
const BOT_PREFIXES = ['dependabot/', 'renovate/', 'release-please--'];

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

// The trunk is detected, not configured — this file is synced from the hub and
// a local edit dies at the next sync. check-push-branch.mjs guards the trunk.
// main stays a trunk while a repo moves its default branch away from it.
const trunks = new Set(['main', defaultBranch()]);

// The error message for a bad branch name, null for a good one.
export function validateBranchName(branch) {
  if (!branch || trunks.has(branch)) return null;
  if (BOT_PREFIXES.some((prefix) => branch.startsWith(prefix))) return null;
  if (NAME.test(branch)) return null;
  return [
    `Invalid branch name: "${branch}"`,
    '',
    'Format (Conventional Branch): <type>/<description>, lowercase, words joined by - or .',
    `  types: ${TYPES.join(', ')}`,
    '  e.g.:  feat/add-login, fix/issue-42, release/1.2.0',
    'Name the change, not the tool or agent that makes it.',
    '',
    'Rename, then push again:',
    `  git branch -m ${branch} <type>/<description>`,
  ].join('\n');
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const error = validateBranchName(process.env.GITHUB_HEAD_REF || git('symbolic-ref', '--short', 'HEAD'));
  if (error) {
    console.error(error);
    process.exit(1);
  }
}
