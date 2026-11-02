#!/usr/bin/env node
// PreToolUse hook: holds `gh pr create` until the gdd pre-PR check ran.
// Reads .temp/gdd.json at the git root. Passes when there is none, it is for
// another branch, declined, or checked. The Sync writes its entry in
// .claude/settings.json from the gdd Bundle's hook entries.
import { readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PR_CREATE = /\bgh\s+pr\s+create\b/;

export function blocks(command, state, branch) {
  return (
    PR_CREATE.test(command ?? '') && state?.status === 'active' && state.branch === branch && state.checked !== true
  );
}

const git = (cwd, ...parts) => execFileSync('git', parts, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();

function readState(root) {
  try {
    return JSON.parse(readFileSync(join(root, '.temp', 'gdd.json'), 'utf8'));
  } catch {
    return null; // none or unreadable: nothing to hold
  }
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const command = input.tool_input?.command;
  if (!PR_CREATE.test(command ?? '')) return;
  const cwd = input.cwd ?? process.cwd();
  let root, branch;
  try {
    root = git(cwd, 'rev-parse', '--show-toplevel');
    branch = git(cwd, 'branch', '--show-current');
  } catch {
    return; // not a git repo
  }
  if (!blocks(command, readState(root), branch)) return;
  console.error(
    'GDD: run the pre-PR check first. Read .agents/skills/gdd/SKILL.md, section "Pre-PR check". It sets `checked: true` in .temp/gdd.json.',
  );
  process.exit(2);
}

// Node loads the main module through its real path; argv[1] keeps the path as typed.
const isMain = () => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isMain()) main();
