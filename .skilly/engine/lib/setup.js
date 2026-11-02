import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { cloneRelease, latestRelease } from './add-remove.js';
import { HUB_REPO } from './constants.js';
import { ghCli, pushSyncBranch, reportSections } from './delivery.js';
import { applySettings } from './repo-settings.js';
import { tryRun } from './run.js';
import { selfSource } from './self-source.js';
import * as skillsCli from './skills-cli.js';
import * as skillyFile from './skilly-file.js';

// The apply phase of Setup (ADR-0009 decision 3, ADR-0008 decisions 13 to 15).
// It reads a complete .skilly/config.json and asks nothing: Hub read check,
// the first Sync on the setup branch and the Setup PR, then repo settings.
// Each step checks first, so a second run changes nothing.
export const SETUP_BRANCH = 'chore/skilly-setup';
const LEGACY_CONFIG = '.skilly.json';

// One skills folder for every agent: .agents/skills holds the files,
// .claude/skills is a symlink to it. The skills CLI writes through the link.
export function linkSkillsDir(cwd) {
  const agentsDir = join(cwd, '.agents', 'skills');
  const claudeDir = join(cwd, '.claude', 'skills');
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(join(cwd, '.claude'), { recursive: true });
  const stat = (() => {
    try {
      return lstatSync(claudeDir);
    } catch {
      return null;
    }
  })();
  if (stat?.isSymbolicLink()) return false;
  if (stat) {
    for (const entry of readdirSync(claudeDir)) {
      const from = join(claudeDir, entry);
      const to = join(agentsDir, entry);
      if (lstatSync(from).isSymbolicLink()) {
        // Older skilly linked each skill on its own into .agents/skills; the dir link covers those.
        const target = resolve(claudeDir, readlinkSync(from));
        if (target !== to)
          throw new Error(`.claude/skills/${entry} links to ${target}, not .agents/skills — move it by hand`);
        unlinkSync(from);
        continue;
      }
      if (existsSync(to))
        throw new Error(`.claude/skills/${entry} and .agents/skills/${entry} both exist — merge them by hand`);
      renameSync(from, to);
    }
    rmdirSync(claudeDir);
  }
  symlinkSync(join('..', '.agents', 'skills'), claudeDir);
  return true;
}

// .temp/ is every repo's scratch space for agents: throwaway scripts, commit
// messages, PR bodies, skill state. Returns true when it added the entry.
export function ignoreTemp(cwd) {
  const path = join(cwd, '.gitignore');
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (/^\/?\.temp\/?$/m.test(text)) return false;
  appendFileSync(path, `${text && !text.endsWith('\n') ? '\n' : ''}.temp/\n`);
  return true;
}

// Local commands clone the Hub at a Release with the person's gh login
// (ADR-0008 decision 15). Returns null when that login can read the Hub, else
// the command that invites it as a read collaborator.
export function hubInvite(gh) {
  const permissions = (() => {
    try {
      return JSON.parse(gh(['api', `repos/${HUB_REPO}`])).permissions;
    } catch {
      return null;
    }
  })();
  if (permissions?.pull) return null;
  const { login } = JSON.parse(gh(['api', 'user']));
  return `gh api -X PUT repos/${HUB_REPO}/collaborators/${login} -f permission=pull`;
}

// The files Setup adds next to the Sync, on the setup branch in `tree`: the
// person's config, the skills folder link and the .temp/ entry. Returns the
// paths to commit.
function prepareTree(tree, config) {
  const paths = [skillyFile.CONFIG_PATH, '.gitignore', '.agents', '.claude/skills'];
  if (existsSync(join(tree, LEGACY_CONFIG))) {
    rmSync(join(tree, LEGACY_CONFIG));
    paths.push(LEGACY_CONFIG);
  }
  skillyFile.write(tree, config);
  linkSkillsDir(tree);
  ignoreTemp(tree);
  return paths;
}

// No settings section: Setup sets them right after, so the drift the Sync saw
// is already gone.
const setupBody = (report) =>
  [
    `Sets up skilly at Release ${report.release.after}. A person merges it once \`ci / verify\` is green.`,
    ...reportSections({ ...report, settings: null }),
    '',
  ].join('\n');

// The config Setup applies: the checkout's, else the one on the Setup PR branch.
// Setup removes an uncommitted one from the checkout, so a second run reads the
// branch. Returns null when neither has one.
export function readSetupConfig(cwd) {
  if (skillyFile.exists(cwd)) return skillyFile.read(cwd);
  if (tryRun('git', ['fetch', '--quiet', 'origin', SETUP_BRANCH], { cwd }) === null) return null;
  const text = tryRun('git', ['show', `origin/${SETUP_BRANCH}:${skillyFile.CONFIG_PATH}`], { cwd });
  return text === null ? null : skillyFile.parse(text);
}

// origin holds the config now. An uncommitted copy in the checkout, untracked
// or staged, would stop the person's `git pull` after the merge (#260).
// Returns true when it removed one.
function removeUncommittedConfig(cwd) {
  if (!skillyFile.exists(cwd)) return false;
  if (tryRun('git', ['cat-file', '-e', `HEAD:${skillyFile.CONFIG_PATH}`], { cwd }) !== null) return false;
  tryRun('git', ['rm', '--quiet', '--cached', '--ignore-unmatch', '--', skillyFile.CONFIG_PATH], { cwd });
  rmSync(join(cwd, skillyFile.CONFIG_PATH));
  return true;
}

// Returns { invite, settings, report, pr }. pr is null when the default branch
// already holds this setup. log prints each step for the person.
export function setup({
  cwd,
  repo = selfSource(cwd),
  skills = skillsCli,
  gh = ghCli(cwd),
  latestRelease: newest = latestRelease,
  fetchSnapshot = cloneRelease,
  log = console.log,
}) {
  const config = readSetupConfig(cwd);
  if (!config) {
    throw new Error(
      `no ${skillyFile.CONFIG_PATH} — the decide phase writes it (the setup-project skill). Setup PR merged: git pull`,
    );
  }
  if (!repo) throw new Error('no GitHub origin here — create the repo on GitHub and push it first');

  const invite = hubInvite(gh);
  if (invite) log(`this gh login cannot read ${HUB_REPO}. The Hub owner runs:\n  ${invite}`);

  const snapshot = fetchSnapshot(config.hub ?? newest());
  let delivery;
  try {
    delivery = pushSyncBranch({
      cwd,
      snapshot,
      skills,
      gh,
      branch: SETUP_BRANCH,
      title: ({ release }) => `chore(skilly): set up skilly at ${release.after}`,
      body: setupBody,
      prepare: (tree) => prepareTree(tree, config),
      // The Setup PR is often the first run of the repo's Actions.
      workflowsFirst: true,
    });
  } finally {
    snapshot.cleanup();
  }
  const { report, pr } = delivery;
  if (!pr) log(`nothing to set up: the default branch already runs Release ${snapshot.release}`);
  else if (!pr.pushed) log(`Setup PR unchanged: ${pr.url}`);
  else log(`Setup PR ${pr.created ? 'opened' : 'updated'}: ${pr.url}`);
  if (removeUncommittedConfig(cwd))
    log(`removed the uncommitted ${skillyFile.CONFIG_PATH}: origin holds it. Run git pull after the merge`);

  // Settings last: the ruleset requires `verify`, and only the Setup PR brings
  // the ci.yml that reports it. A failed Sync leaves the default branch open.
  const settings = applySettings(repo);
  for (const { setting, want } of settings.drift) log(`set ${setting}: ${JSON.stringify(want)}`);
  for (const { setting, reason } of settings.unavailable) log(`unavailable: ${setting}: ${reason}`);
  return { invite, settings, report, pr };
}
