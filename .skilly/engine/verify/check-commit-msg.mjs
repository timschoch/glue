// Conventional-commit check, zero-dependency. Two callers, one copy of the rule:
//   node <path-to>/check-commit-msg.mjs "$1"       the commit-msg hook, one message file
//   node <path-to>/check-commit-msg.mjs --branch   the workflow Bundle's verify step: every
//                                                  commit the branch adds over its base
// The rules' why: the writing-rules skill (workflow bundle), group 7.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defaultBranch } from './default-branch.mjs';

const TYPES = ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'ci', 'build', 'perf', 'style', 'revert'];
const HEADER = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9./-]+\\))?!?: \\S.{0,71}$`);
const PASSTHROUGH = ['Merge ', 'Revert ', 'fixup!', 'squash!'];

const headerOf = (message) =>
  message
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .find((line) => line.trim()) ?? '';
const isValid = (header) => PASSTHROUGH.some((prefix) => header.startsWith(prefix)) || HEADER.test(header);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

// Merges skipped. History from before a repo adopted skilly is out of scope by construction.
// GITHUB_BASE_REF is set on pull_request events; else the default branch.
const validateBranch = () => {
  const branch = process.env.GITHUB_BASE_REF || defaultBranch();
  let base = `origin/${branch}`;
  try {
    git('rev-parse', '--verify', '--quiet', base);
  } catch {
    base = branch;
  }
  const shas = git('log', '--no-merges', '--format=%h', `${base}..HEAD`).split('\n').filter(Boolean);
  if (!shas.length) {
    console.log(`no commits over ${base}, nothing to check`);
    return 0;
  }
  let status = 0;
  for (const sha of shas.reverse()) {
    const header = headerOf(git('log', '-1', '--format=%B', sha));
    if (isValid(header)) console.log(`ok   ${sha} ${header}`);
    else {
      console.log(`FAIL ${sha} ${header}`);
      status = 1;
    }
  }
  return status;
};

const file = process.argv[2];
if (file === '--branch') process.exit(validateBranch());
if (!file) {
  console.error('check-commit-msg: no message file given');
  process.exit(1);
}

const header = headerOf(readFileSync(file, 'utf8'));
if (isValid(header)) process.exit(0);

console.error(
  [
    `Invalid commit message: "${header}"`,
    '',
    'Format (Conventional Commits): <type>(<scope>)?: <description>',
    `  types: ${TYPES.join(', ')}`,
    '  e.g.:  feat(sync): add nightly prune report',
  ].join('\n'),
);
process.exit(1);
