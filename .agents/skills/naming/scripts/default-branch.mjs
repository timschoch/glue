// The default branch: the one GitHub names default. Never assume main.
// A skill must work alone, so each skill that needs this ships its own copy;
// scripts/validate-shared-copies.mjs keeps every copy equal to this source.
// Order: DEFAULT_BRANCH, then the GitHub event payload (every Actions run,
// schedule included; actions/checkout sets no origin/HEAD), then origin/HEAD
// (git clone sets it), then main. Run as a script, it prints the branch.
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function defaultBranch(cwd = process.cwd()) {
  if (process.env.DEFAULT_BRANCH) return process.env.DEFAULT_BRANCH;
  try {
    const branch = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).repository?.default_branch;
    if (branch) return branch;
  } catch {
    // Not in GitHub Actions, or an event without a repository.
  }
  try {
    const ref = execFileSync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return ref.trim().replace(/^origin\//, '');
  } catch {
    return 'main';
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(defaultBranch());
}
