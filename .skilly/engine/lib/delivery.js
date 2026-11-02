import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultBranch } from '../verify/default-branch.mjs';
import { cloneRelease, latestRelease } from './add-remove.js';
import { run, tryRun } from './run.js';
import { selfSource } from './self-source.js';
import * as skillsCli from './skills-cli.js';
import { sync } from './sync.js';

// The delivery for one Consumer (ADR-0008 decisions 8, 11, 20 and 21): run the
// Sync on a fresh copy of the default branch, push the Sync PR branch, open
// or update the one Sync PR, apply the auto-merge rule. The Hub nightly and
// `skilly sync` both call it. All GitHub calls go through gh.
export const SYNC_BRANCH = 'chore/skilly-sync';
const WORKFLOWS = '.github/workflows';

const major = (release) => release?.match(/^v(\d+)\./)?.[1];

// The one auto-merge rule. No Release before counts as a new major.
export function autoMerge({ release, skills, bundles }) {
  if (skills.removed.length || bundles.removed.length) return { on: false, reason: 'the Sync removes skills or Bundles' };
  if (major(release.after) !== major(release.before)) return { on: false, reason: 'new major Release' };
  return { on: true, reason: 'merges when `ci / verify` is green' };
}

// The sections of a PR body that list what the Sync did. The Sync PR and the
// setup PR share them.
export function reportSections({ skills, bundles, files, settings }) {
  // Setup sets the repo settings; the Sync PR only reports them (ADR-0009 decision 8).
  const settingLines = [
    ...(settings?.drift ?? []).map(
      ({ setting, want, have }) => `\`${setting}\`: \`${JSON.stringify(have)}\`, wanted \`${JSON.stringify(want)}\``,
    ),
    ...(settings?.unavailable ?? []).map(({ setting, reason }) => `\`${setting}\`: unavailable, ${reason}`),
  ];
  const section = (title, items, format = (item) => item) =>
    items.length ? ['', `## ${title}`, ...items.map((item) => `- ${format(item)}`)] : [];
  return [
    ...section('⚠️ Removed', skills.removed),
    ...section('⚠️ Bundles the Release dropped', bundles.removed),
    ...section('⚠️ Repo settings drift', settingLines),
    ...section('Added', skills.added),
    ...section('Updated', skills.updated),
    ...section(`Files (${files.length})`, files, (file) => `\`${file}\``),
  ];
}

export function prBody(report) {
  const { release } = report;
  const merge = autoMerge(report);
  return [
    `Sync to Release ${release.before ?? 'none'} → ${release.after}.`,
    ...reportSections(report),
    '',
    `Auto-merge: ${merge.on ? 'on' : 'off'}, ${merge.reason}.`,
    '',
  ].join('\n');
}

export const ghCli = (cwd) => (args) => run('gh', args, { cwd });

// Runs the Sync on a fresh copy of the default branch, commits the result onto
// `branch`, pushes it and opens or updates the one PR from it. The person's
// checkout stays as it was: the Sync runs in a temporary worktree.
// prepare(tree) runs before the Sync and returns more paths to commit.
// title(report) and body(report) write the PR. Returns { report, pr }. pr is
// null when the branch would hold no change. pr.pushed is false when the open
// PR's branch already holds the same files, so a second run changes nothing.
// workflowsFirst commits and pushes the .github/workflows change alone first:
// GitHub reads only the first 300 files of a push, and a repo whose Actions
// never ran sees no workflow past them, so its PR gets no run (#251).
export function pushSyncBranch({
  cwd,
  snapshot,
  skills = skillsCli,
  gh = ghCli(cwd),
  branch,
  title,
  body,
  prepare = () => [],
  workflowsFirst = false,
}) {
  const base = defaultBranch(cwd);
  run('git', ['fetch', '--quiet', 'origin', base], { cwd });
  const tree = join(mkdtempSync(join(tmpdir(), 'skilly-sync-')), 'checkout');
  try {
    run('git', ['worktree', 'add', '--quiet', '--detach', tree, `origin/${base}`], { cwd });
    const paths = [...prepare(tree)];
    const report = sync({ cwd: tree, snapshot, skills, repo: selfSource(cwd) });
    paths.push(...report.files);
    if (paths.length) run('git', ['add', '--all', '--', ...paths], { cwd: tree });
    // `diff --quiet` exits 1 when something is staged.
    if (tryRun('git', ['diff', '--cached', '--quiet'], { cwd: tree }) !== null) return { report, pr: null };

    const subject = title(report);
    const [open] = JSON.parse(gh(['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,url']));
    // An open PR already had its first push.
    const staged = run('git', ['diff', '--cached', '--name-only'], { cwd: tree }).split('\n');
    const isWorkflow = (path) => path.startsWith(`${WORKFLOWS}/`);
    const shouldPushWorkflowsFirst = workflowsFirst && !open && staged.some(isWorkflow) && !staged.every(isWorkflow);
    // The PR is checked by `ci / verify`; local hooks do not run on it.
    if (shouldPushWorkflowsFirst) {
      run('git', ['commit', '--quiet', '--no-verify', '-m', 'chore(skilly): write the workflows first', '--', WORKFLOWS], { cwd: tree });
    }
    run('git', ['commit', '--quiet', '--no-verify', '-m', subject], { cwd: tree });
    tryRun('git', ['fetch', '--quiet', 'origin', branch], { cwd });
    const pushedTree = tryRun('git', ['rev-parse', '--verify', '--quiet', `origin/${branch}^{tree}`], { cwd });
    if (open && pushedTree === run('git', ['rev-parse', 'HEAD^{tree}'], { cwd: tree })) {
      return { report, pr: { url: open.url, created: false, pushed: false } };
    }

    const push = (ref) => run('git', ['push', '--quiet', '--force', '--no-verify', 'origin', `${ref}:refs/heads/${branch}`], { cwd: tree });
    if (shouldPushWorkflowsFirst) push('HEAD~1');
    push('HEAD');
    const text = body(report);
    if (open) {
      gh(['pr', 'edit', open.url, '--title', subject, '--body', text]);
      return { report, pr: { url: open.url, created: false, pushed: true } };
    }
    const url = gh(['pr', 'create', '--base', base, '--head', branch, '--title', subject, '--body', text]);
    return { report, pr: { url, created: true, pushed: true } };
  } finally {
    tryRun('git', ['worktree', 'remove', '--force', tree], { cwd });
    rmSync(join(tree, '..'), { recursive: true, force: true });
  }
}

// Returns { report, pr, autoMerge }. pr is null when the Sync changed nothing.
// autoMerge is null when nothing was pushed.
export function deliver({ cwd, snapshot, skills = skillsCli, gh = ghCli(cwd) }) {
  const { report, pr } = pushSyncBranch({
    cwd,
    snapshot,
    skills,
    gh,
    branch: SYNC_BRANCH,
    title: ({ release }) => `chore(skilly): sync to ${release.after}`,
    body: prBody,
  });
  if (!pr?.pushed) return { report, pr, autoMerge: null };

  // Turning auto-merge on fails when the repo does not allow it; that leaves
  // the PR open for a person. Turning it off fails when it was never on, which
  // does not matter.
  const merge = autoMerge(report);
  const done = tryGh(gh, ['pr', 'merge', pr.url, ...(merge.on ? ['--auto', '--squash'] : ['--disable-auto'])]);
  const applied = !merge.on || done;
  return { report, pr, autoMerge: { ...merge, applied } };
}

function tryGh(gh, args) {
  try {
    gh(args);
    return true;
  } catch {
    return false;
  }
}

// `skilly sync`: fetch the newest Release and run its Engine's delivery. The
// local Engine only starts it, so old Engine code never writes a newer Release.
export function startSync({
  cwd,
  latestRelease: newest = latestRelease,
  fetchSnapshot = cloneRelease,
  runEngine = (bin, args) => spawnSync('node', [bin, ...args], { cwd, stdio: 'inherit' }).status ?? 1,
}) {
  const snapshot = fetchSnapshot(newest());
  try {
    return runEngine(join(snapshot.dir, 'engine', 'bin', 'skilly.js'), ['deliver', snapshot.dir, snapshot.release]);
  } finally {
    snapshot.cleanup();
  }
}
