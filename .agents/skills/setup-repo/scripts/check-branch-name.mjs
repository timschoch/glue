// Conventional Branch gate, zero-dependency. Wire as a `push` step in
// .skilly/verify.json, so CI runs it too:
//   node .claude/hooks/check-branch-name.mjs
// Locally it reads the checked-out branch. In CI HEAD is detached, so it reads
// the PR's head branch from GITHUB_HEAD_REF; a push build has neither and passes.
import { execFileSync } from 'node:child_process';

const TYPES = ['feat', 'fix', 'hotfix', 'epic', 'release', 'chore'];
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
const trunks = new Set(['main', git('symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, '')]);

const branch = process.env.GITHUB_HEAD_REF || git('symbolic-ref', '--short', 'HEAD');

if (!branch || trunks.has(branch)) process.exit(0);
if (BOT_PREFIXES.some((prefix) => branch.startsWith(prefix))) process.exit(0);
if (NAME.test(branch)) process.exit(0);

console.error(
  [
    `Invalid branch name: "${branch}"`,
    '',
    'Format (Conventional Branch): <type>/<description>, lowercase, words joined by - or .',
    `  types: ${TYPES.join(', ')}`,
    '  e.g.:  feat/add-login, fix/issue-42, release/1.2.0',
    'Name the change, not the tool or agent that makes it.',
    '',
    'Rename, then push again:',
    '  git branch -m <type>/<description>',
  ].join('\n'),
);
process.exit(1);
