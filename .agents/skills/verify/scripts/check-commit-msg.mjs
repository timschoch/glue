// Conventional-commit gate, zero-dependency. Wire as the commit-msg hook:
//   node <path-to>/check-commit-msg.mjs "$1"
// The PR gate bundles/workflow/rules/conventional-commits.sh (timschoch/skilly)
// runs this script on every commit, so this file is the single copy of the rule.
// The rules' why: the writing-rules skill (workflow bundle), group 7.
import { readFileSync } from 'node:fs';

const TYPES = ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'ci', 'build', 'perf', 'style', 'revert'];
const HEADER = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9./-]+\\))?!?: \\S.{0,71}$`);
const PASSTHROUGH = ['Merge ', 'Revert ', 'fixup!', 'squash!'];

const file = process.argv[2];
if (!file) {
  console.error('check-commit-msg: no message file given');
  process.exit(1);
}

const lines = readFileSync(file, 'utf8').split('\n').filter((line) => !line.startsWith('#'));
const header = lines.find((line) => line.trim()) ?? '';

if (PASSTHROUGH.some((prefix) => header.startsWith(prefix))) process.exit(0);
if (HEADER.test(header)) process.exit(0);

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
