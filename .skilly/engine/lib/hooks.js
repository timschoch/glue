import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { HUB_REPO, LEFTHOOK_VERSION } from './constants.js';
import * as lockfile from './lockfile.js';
import { selfSource } from './self-source.js';

// The two hook mergers (ADR-0008 decision 22). A Bundle declares its hook
// entries in config.json: `hooks.lefthook` in lefthook's config shape,
// `hooks.claude` in the shape of `hooks` in .claude/settings.json. The Sync
// writes only those entries and keeps every entry the Consumer added itself.
//
// A skilly entry runs a file under .skilly/, runs the same command as an entry
// of a Bundle, or is one of the exact commands older skilly versions wrote. An
// own entry that runs a file from an own skill folder stays.
const SKILLY_PATH = /\.skilly\//;
// Written by setup-repo (lefthook.yml, .husky/, .claude/settings.json),
// setup-pre-commit (`npx lint-staged`) and gdd setup.mjs. husky lines compare
// with `$1` as `{1}`.
const LEGACY_COMMANDS = new Set([
  'npx lint-staged',
  'node .agents/skills/verify/scripts/check-commit-msg.mjs {1}',
  'node .agents/skills/verify/scripts/check-push-branch.mjs',
  'node .agents/skills/verify/scripts/verify.mjs push',
  'node .claude/hooks/check-commit-msg.mjs {1}',
  'node .claude/hooks/check-push-branch.mjs',
  'bash "$CLAUDE_PROJECT_DIR"/.agents/skills/verify/scripts/block-destructive-git.sh',
  'bash "$CLAUDE_PROJECT_DIR"/.agents/skills/verify/scripts/block-invalid-branch-push.sh',
  'bash "$CLAUDE_PROJECT_DIR"/.agents/skills/verify/scripts/block-unverified-push.sh',
  '"$CLAUDE_PROJECT_DIR"/.claude/hooks/block-destructive-git.sh',
  '"$CLAUDE_PROJECT_DIR"/.claude/hooks/block-invalid-branch-push.sh',
  '"$CLAUDE_PROJECT_DIR"/.claude/hooks/block-unverified-push.sh',
  'node "$CLAUDE_PROJECT_DIR/.claude/skills/gdd/scripts/check-pr.mjs"',
]);
// lefthook merges this file into lefthook.yml through `extends`, so the Engine
// needs no YAML parser. On a name clash the extends file wins: skilly command
// names start with `skilly-`.
const SKILLY_LEFTHOOK = join('.skilly', 'lefthook.json');
const EXTENDS_ITEM = '- .skilly/lefthook.json';
const LEFTHOOK_FILES = ['lefthook.yml', 'lefthook.yaml', '.lefthook.yml', '.lefthook.yaml'];
const SETTINGS = join('.claude', 'settings.json');
// husky leaves core.hooksPath set; plain `lefthook install` refuses to run then. `lefthook install`
// fails with no .git, as in a container build, so it runs only in a checkout. The parentheses keep
// the `||` from hiding a failure of a command before it.
const LEFTHOOK_INSTALL = '(test ! -e .git || lefthook install --reset-hooks-path)';
const HUSKY_COMMAND = 'husky';
const HUSKY_DIR = '.husky';
// husky as a word or a path part: `npx husky install`, `./.husky/x`, which the Sync deletes,
// `node_modules/.bin/husky`. Not `my-husky` or `husky-foo`.
const HUSKY_PREPARE = /(?<![\w.-])\.?husky(?![\w.-])/;
const PNPM_WORKSPACE = 'pnpm-workspace.yaml';
// Every path writeHooks may change, for the Sync report.
export const HOOK_PATHS = [
  SETTINGS,
  SKILLY_LEFTHOOK,
  ...LEFTHOOK_FILES,
  HUSKY_DIR,
  'package.json',
  PNPM_WORKSPACE,
  ...lockfile.LOCKFILES,
];

const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback);
const toJson = (value) => JSON.stringify(value, null, 2) + '\n';

// Writes `content` when it differs. Returns true when it wrote.
function writeChanged(path, content) {
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return true;
}

/** The hook entries of `bundles`, already resolved with their includes: `{ lefthook, claude }`. */
export function hookEntries(bundles, bundlesDir) {
  const lefthook = {};
  const claude = {};
  for (const bundle of bundles) {
    const { hooks = {} } = readJson(join(bundlesDir, bundle, 'config.json'), {});
    for (const [hook, { commands = {}, ...options }] of Object.entries(hooks.lefthook ?? {})) {
      lefthook[hook] = { ...lefthook[hook], ...options, commands: { ...lefthook[hook]?.commands, ...commands } };
    }
    for (const [event, groups] of Object.entries(hooks.claude ?? {})) claude[event] = [...(claude[event] ?? []), ...groups];
  }
  return { lefthook, claude };
}

const lefthookRuns = (lefthook) =>
  new Set(Object.values(lefthook).flatMap(({ commands }) => Object.values(commands).map(({ run }) => run)));

const isSkillyCommand = (command, commands) =>
  SKILLY_PATH.test(command) || commands.has(command) || LEGACY_COMMANDS.has(command);

/** `settings` with its skilly hook entries replaced by `claude`. Every other entry and setting stays. */
export function mergeClaudeSettings(settings, claude) {
  const commands = new Set(
    Object.values(claude).flatMap((groups) => groups.flatMap((group) => group.hooks.map((hook) => hook.command))),
  );
  const hooks = {};
  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    const own = groups
      .map((group) => ({ ...group, hooks: group.hooks.filter((hook) => !isSkillyCommand(hook.command ?? '', commands)) }))
      .filter((group) => group.hooks.length);
    if (own.length) hooks[event] = own;
  }
  for (const [event, groups] of Object.entries(claude)) hooks[event] = [...(hooks[event] ?? []), ...groups];
  if (Object.keys(hooks).length) return { ...settings, hooks };
  const withoutHooks = { ...settings };
  delete withoutHooks.hooks;
  return withoutHooks;
}

// --- lefthook.yml, as text ---------------------------------------------------------

const indentOf = (line) => line.match(/^ */)[0].length;
const isContent = (line) => line.trim() !== '' && !line.trim().startsWith('#');
const unquote = (value) => value.replace(/^(['"])(.*)\1$/, '$2');

// Removes the command block that holds the `run:` line at `index`, with the
// comment lines right above it. Returns the index the block started at.
function removeCommand(lines, index) {
  const runIndent = indentOf(lines[index]);
  let start = index;
  while (start > 0 && !(isContent(lines[start]) && indentOf(lines[start]) < runIndent)) start--;
  const commandIndent = indentOf(lines[start]);
  let end = start + 1;
  while (end < lines.length && !(isContent(lines[end]) && indentOf(lines[end]) <= commandIndent)) end++;
  while (end > index + 1 && !isContent(lines[end - 1])) end--;
  while (start > 0 && lines[start - 1].trim().startsWith('#') && indentOf(lines[start - 1]) === commandIndent) start--;
  lines.splice(start, end - start);
  return start;
}

// Removes `key:` lines with no value and no child left, until none is left.
function pruneEmptyKeys(lines) {
  for (let changed = true; changed; ) {
    changed = false;
    for (let index = 0; index < lines.length; index++) {
      if (!/^\s*[^\s#-][^:]*:\s*$/.test(lines[index])) continue;
      const next = lines.slice(index + 1).find(isContent);
      const indent = indentOf(lines[index]);
      const hasChild = next && (indentOf(next) > indent || (indentOf(next) === indent && next.trim().startsWith('-')));
      if (hasChild) continue;
      lines.splice(index, 1);
      changed = true;
    }
  }
}

/** lefthook.yml `text` without skilly commands, extending `.skilly/lefthook.json`. `runs`: the skilly commands. */
export function mergeLefthook(text, runs) {
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^\s+run:\s*(.+?)\s*$/);
    if (match && isSkillyCommand(unquote(match[1]), runs)) index = removeCommand(lines, index) - 1;
  }
  pruneEmptyKeys(lines);
  let merged = lines.join('\n');
  if (merged.split('\n').some((line) => line.trim() === EXTENDS_ITEM)) return merged;

  const extendsIndex = lines.findIndex((line) => /^extends:/.test(line));
  if (extendsIndex === -1) {
    const body = merged.replace(/^\n+/, '');
    return `extends:\n  ${EXTENDS_ITEM}\n${body ? `\n${body}` : ''}`;
  }
  if (!/^extends:\s*$/.test(lines[extendsIndex])) {
    throw new Error(`lefthook.yml: write \`extends\` as a block list, then add \`${EXTENDS_ITEM}\` to it`);
  }
  const next = lines[extendsIndex + 1] ?? '';
  const indent = ' '.repeat(next.trim().startsWith('-') ? indentOf(next) : 2);
  lines.splice(extendsIndex + 1, 0, `${indent}${EXTENDS_ITEM}`);
  return lines.join('\n');
}

// --- husky -------------------------------------------------------------------------

const HUSKY_BOILERPLATE = /^#!|husky\.sh/;

// hook -> the Consumer's own lines in .husky/<hook>, as one lefthook command.
function ownHuskyLines(huskyDir, runs) {
  const own = {};
  for (const hook of readdirSync(huskyDir).sort()) {
    const path = join(huskyDir, hook);
    if (!statSync(path).isFile()) continue;
    const lines = readFileSync(path, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => isContent(line) && !HUSKY_BOILERPLATE.test(line))
      .map((line) => line.replace(/"\$1"|\$1\b/g, '{1}'))
      .filter((line) => !isSkillyCommand(line, runs));
    if (lines.length) own[hook] = lines;
  }
  return own;
}

function huskyCommandsYaml(own, lefthookText) {
  return Object.entries(own)
    .map(([hook, lines]) => {
      if (new RegExp(`^${hook}:`, 'm').test(lefthookText)) {
        throw new Error(`lefthook.yml already has ${hook}: move the lines of .husky/${hook} into it by hand`);
      }
      const run = lines.length === 1 ? lines[0] : `|\n${lines.map((line) => `        ${line}`).join('\n')}`;
      return `${hook}:\n  commands:\n    ${HUSKY_COMMAND}:\n      run: ${run}\n`;
    })
    .join('');
}

// --- package.json ------------------------------------------------------------------

// `prepare` with one lefthook install in place of its commands that name husky, at the first of them.
// `||` does not split: the install holds one, and `husky || true` goes as a whole. An `if` or a
// subshell does not survive the split, so it throws: a broken `prepare` fails every install.
function replaceHuskyCommands(prepare) {
  const replaced = prepare
    .split(/&&|;/)
    .map((command) => command.trim())
    .filter(Boolean)
    .map((command) => (HUSKY_PREPARE.test(command) ? LEFTHOOK_INSTALL : command))
    .filter((command, index, commands) => command !== LEFTHOOK_INSTALL || commands.indexOf(command) === index)
    .join(' && ');
  if (spawnSync('sh', ['-n', '-c', replaced]).status) {
    throw new Error(`package.json: move \`prepare\` from husky to lefthook by hand, the Sync cannot rewrite: ${prepare}`);
  }
  return replaced;
}

/** `manifest`, a parsed package.json, with lefthook in place of husky. The same object when nothing changes. */
export function mergePackageJson(manifest) {
  const merged = structuredClone(manifest);
  for (const key of ['dependencies', 'devDependencies']) if (merged[key]) delete merged[key].husky;
  if (!merged.dependencies?.lefthook && !merged.devDependencies?.lefthook) {
    const devDependencies = { ...merged.devDependencies, lefthook: LEFTHOOK_VERSION };
    const byName = ([first], [second]) => first.localeCompare(second);
    merged.devDependencies = Object.fromEntries(Object.entries(devDependencies).sort(byName));
  }
  const prepare = merged.scripts?.prepare;
  if (!prepare) merged.scripts = { ...merged.scripts, prepare: LEFTHOOK_INSTALL };
  else if (HUSKY_PREPARE.test(prepare)) merged.scripts.prepare = replaceHuskyCommands(prepare);
  else if (!/\blefthook\b/.test(prepare)) merged.scripts.prepare = `${prepare} && ${LEFTHOOK_INSTALL}`;
  return JSON.stringify(merged) === JSON.stringify(manifest) ? manifest : merged;
}

// --- pnpm-workspace.yaml, as text --------------------------------------------------

/**
 * pnpm-workspace.yaml `text` with lefthook in `allowBuilds`. pnpm 11 fails an install on a build
 * script that list does not name, and `prepare` installs the hooks, so the postinstall has no job.
 * A value the Consumer set stays.
 */
export function mergePnpmWorkspace(text) {
  const lines = text.split('\n');
  const index = lines.findIndex((line) => /^allowBuilds:/.test(line));
  if (index === -1) return `${text}${text && !text.endsWith('\n') ? '\n' : ''}allowBuilds:\n  lefthook: false\n`;
  if (!/^allowBuilds:\s*(\s#.*)?$/.test(lines[index])) {
    throw new Error(`${PNPM_WORKSPACE}: write \`allowBuilds\` as a block map, then add \`lefthook: false\` to it`);
  }
  const nextKey = lines.findIndex((line, at) => at > index && isContent(line) && indentOf(line) === 0);
  const block = lines.slice(index + 1, nextKey === -1 ? lines.length : nextKey);
  if (block.some((line) => /^\s+['"]?lefthook['"]?:/.test(line))) return text;
  const indent = ' '.repeat(indentOf(block.find(isContent) ?? '  '));
  lines.splice(index + 1, 0, `${indent}lefthook: false`);
  return lines.join('\n');
}

const namesPnpm11 = ({ packageManager }) => Number(/^pnpm@(\d+)/.exec(packageManager)?.[1]) >= 11;

// --- the Sync step -----------------------------------------------------------------

/**
 * Writes the hook entries of `bundles` into .claude/settings.json and, through
 * .skilly/lefthook.json, into lefthook.yml. Moves a husky Consumer to lefthook.
 * A changed package.json gets its lockfile refreshed. The Hub wires engine/ itself.
 *
 * A pnpm Consumer's pnpm-workspace.yaml gets lefthook in `allowBuilds`. A new file is written only
 * for pnpm 11 or higher in `packageManager`: pnpm below 11 does not fail an install on an unapproved
 * build script, and pnpm 9.15 and 10.0 fail on a file with no `packages`.
 */
export function writeHooks(cwd, { bundles, bundlesDir, refreshLock = lockfile.refreshLock }) {
  if (selfSource(cwd)?.toLowerCase() === HUB_REPO) return;
  const { lefthook, claude } = hookEntries(bundles, bundlesDir);
  // It throws on a husky clash, so it runs before the first write.
  const lefthookFile = mergedLefthookFile(cwd, lefthook);

  const settingsPath = join(cwd, SETTINGS);
  const settings = readJson(settingsPath, null);
  if (settings || Object.keys(claude).length) writeChanged(settingsPath, toJson(mergeClaudeSettings(settings ?? {}, claude)));
  if (!lefthookFile) return;
  writeChanged(join(cwd, SKILLY_LEFTHOOK), toJson(lefthook));
  writeChanged(lefthookFile.path, lefthookFile.text);
  rmSync(join(cwd, HUSKY_DIR), { recursive: true, force: true });

  const packagePath = join(cwd, 'package.json');
  if (!existsSync(packagePath)) return;
  const manifest = readJson(packagePath);
  const merged = mergePackageJson(manifest);
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
    const workspacePath = join(cwd, PNPM_WORKSPACE);
    if (existsSync(workspacePath)) writeChanged(workspacePath, mergePnpmWorkspace(readFileSync(workspacePath, 'utf8')));
    else if (namesPnpm11(manifest)) writeChanged(workspacePath, mergePnpmWorkspace(''));
  }
  if (merged !== manifest && writeChanged(packagePath, toJson(merged))) refreshLock(cwd);
}

// The Consumer's lefthook file, merged with its .husky/ lines: `{ path, text }`.
// null when no Bundle has lefthook entries and no earlier Sync wrote any.
function mergedLefthookFile(cwd, lefthook) {
  if (!Object.keys(lefthook).length && !existsSync(join(cwd, SKILLY_LEFTHOOK))) return null;
  const runs = lefthookRuns(lefthook);
  const path = join(cwd, LEFTHOOK_FILES.find((file) => existsSync(join(cwd, file))) ?? LEFTHOOK_FILES[0]);
  let own = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const huskyDir = join(cwd, HUSKY_DIR);
  const husky = existsSync(huskyDir) ? huskyCommandsYaml(ownHuskyLines(huskyDir, runs), own) : '';
  if (husky) own += `${own && !own.endsWith('\n') ? '\n' : ''}${husky}`;
  return { path, text: mergeLefthook(own, runs) };
}
