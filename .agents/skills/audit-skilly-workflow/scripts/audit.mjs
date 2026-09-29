#!/usr/bin/env node
// audit-skilly-workflow, fact half. Run inside a skilly consumer:
//   node .agents/skills/audit-skilly-workflow/scripts/audit.mjs
// Prints JSON: where to write the report, every instruction source with its
// owner, installed skill descriptions, gate values, and config findings a
// machine decides alone. Meaning conflicts are the model's job, see SKILL.md.
// Reads only. No network.
import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_EXTENSIONS = /\.(sh|mjs|cjs|js|ts|py)$/;
const SKIP_SEGMENTS = new Set(['node_modules', '.git', '.agents', 'dist', 'build']);

const findText = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

const parseJson = (path) => {
  try {
    return JSON.parse(findText(path));
  } catch {
    return null;
  }
};

const isDirectory = (path) => existsSync(path) && statSync(path).isDirectory();

function runGit(root, parts) {
  try {
    return execFileSync('git', parts, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function listFiles(directory, pattern) {
  if (!isDirectory(directory)) return [];
  // statSync through isDirectory: a symlinked skill folder counts as a folder.
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name);
      if (isDirectory(path)) return listFiles(path, pattern);
      return pattern.test(name) ? [path] : [];
    })
    .sort();
}

const getFrontmatter = (text) => text?.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1].replace(/\r/g, '') ?? '';

// Frontmatter `description:`, inline, quoted, or a block over several lines.
function getDescription(text) {
  const lines = getFrontmatter(text).split('\n');
  const start = lines.findIndex((line) => line.startsWith('description:'));
  if (start === -1) return '';
  const parts = [lines[start].slice('description:'.length).trim().replace(/^[>|]-?$/, '')];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && !/^\s/.test(line)) break;
    parts.push(line.trim());
  }
  return parts.filter(Boolean).join(' ').replace(/^["']|["']$/g, '');
}

// --- sources -------------------------------------------------------------------

// owner: skilly (synced by skilly) | overlay (*.local.md, repo-owned override) | repo | global
// loaded: always (in every session) | on-demand
export function listSources({ root, home, ownerNames }) {
  const sources = [];
  const seen = new Set();
  const add = (path, owner, loaded) => {
    if (seen.has(path) || !existsSync(path) || isDirectory(path)) return;
    seen.add(path);
    sources.push({ path: formatPath(path, { root, home }), owner, loaded, bytes: statSync(path).size });
  };

  const alwaysFiles = ['CLAUDE.md', 'CLAUDE.local.md', '.claude/CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.cursorrules', '.github/copilot-instructions.md'];
  for (const file of alwaysFiles) add(join(root, file), 'repo', 'always');
  for (const path of listFiles(join(root, '.claude', 'rules'), /\.md$/)) {
    const file = basename(path);
    const loaded = /^paths:/m.test(getFrontmatter(findText(path))) ? 'on-demand' : 'always';
    if (file.endsWith('.local.md')) add(path, 'overlay', loaded);
    else add(path, ownerNames.some((name) => file.startsWith(`${name}-`)) ? 'skilly' : 'repo', loaded);
  }
  for (const path of listFiles(join(root, '.cursor', 'rules'), /\.mdc?$/)) {
    add(path, 'repo', /^alwaysApply:\s*true/m.test(getFrontmatter(findText(path))) ? 'always' : 'on-demand');
  }
  const tracked = runGit(root, ['ls-files'])?.split('\n') ?? [];
  for (const file of tracked) {
    if (file.split('/').some((segment) => SKIP_SEGMENTS.has(segment))) continue;
    if (file.includes('/') && /(^|\/)(CLAUDE|AGENTS)\.md$/.test(file)) add(join(root, file), 'repo', 'on-demand');
  }
  for (const directory of ['.claude/agents', '.claude/commands', 'docs/agents']) {
    for (const path of listFiles(join(root, directory), /\.md$/)) add(path, 'repo', 'on-demand');
  }
  for (const file of ['lessons.md', '.claude/lessons.md']) add(join(root, file), 'repo', 'on-demand');

  add(join(home, '.claude', 'CLAUDE.md'), 'global', 'always');
  for (const path of listFiles(join(home, '.claude', 'rules'), /\.md$/)) add(path, 'global', 'always');
  add(join(home, '.codex', 'AGENTS.md'), 'global', 'always');
  return sources;
}

function formatPath(path, { root, home }) {
  if (path.startsWith(`${root}/`)) return relative(root, path);
  if (path.startsWith(`${home}/`)) return `~/${relative(home, path)}`;
  return path;
}

// --- gates -----------------------------------------------------------------------

// Values the model compares instruction text against ("commits up to 80 chars").
export function listGates(root, workflows) {
  const commitHook = findText(join(root, '.claude', 'hooks', 'check-commit-msg.mjs'));
  const types = commitHook?.match(/const TYPES = \[([^\]]*)\]/)?.[1].match(/[a-z]+/g) ?? null;
  const limit = commitHook?.match(/\\S\.\{0,(\d+)\}/)?.[1];

  const commitOthers = [];
  const packageJson = parseJson(join(root, 'package.json'));
  if (packageJson?.commitlint) commitOthers.push('package.json#commitlint');
  for (const file of readdirSync(root)) if (/^(commitlint\.config\.|\.commitlintrc)/.test(file)) commitOthers.push(file);
  const lefthook = findText(join(root, 'lefthook.yml')) ?? findText(join(root, 'lefthook.yaml')) ?? '';
  if (/commit-msg/.test(lefthook) && !/check-commit-msg/.test(lefthook)) commitOthers.push('lefthook.yml');
  const huskyCommit = findText(join(root, '.husky', 'commit-msg'));
  if (huskyCommit && !/check-commit-msg/.test(huskyCommit)) commitOthers.push('.husky/commit-msg');
  for (const path of workflows) {
    if (/commitlint|semantic-pull-request|conventional-commit/i.test(findText(path) ?? '')) commitOthers.push(relative(root, path));
  }

  const verifyFile = parseJson(join(root, '.skilly', 'verify.json'));

  const namingOthers = [];
  for (const file of readdirSync(root)) {
    if (!/^(eslint\.config\.|\.eslintrc|biome\.jsonc?$)/.test(file)) continue;
    if (/naming-convention|filename-case|useNamingConvention|useFilenamingConvention/.test(findText(join(root, file)) ?? '')) namingOthers.push(file);
  }

  return {
    commit: {
      skilly: commitHook ? { file: '.claude/hooks/check-commit-msg.mjs', types, descriptionMax: limit ? Number(limit) + 1 : null } : null,
      others: commitOthers,
    },
    naming: { skilly: existsSync(join(root, '.agents', 'skills', 'naming')), others: namingOthers },
    // Stage -> steps that hooks and CI run through the verify skill.
    verify: verifyFile?.stages ? { file: '.skilly/verify.json', stages: verifyFile.stages } : null,
  };
}

// --- findings ----------------------------------------------------------------------
// { kind, where, detail }. Only what config decides alone.

function listHookEntries(root) {
  const entries = [];
  for (const file of ['.claude/settings.json', '.claude/settings.local.json']) {
    for (const [event, groups] of Object.entries(parseJson(join(root, file))?.hooks ?? {})) {
      for (const group of Array.isArray(groups) ? groups : []) {
        for (const hook of group.hooks ?? []) {
          if (hook.command) entries.push({ file, event, matcher: group.matcher ?? '', command: hook.command });
        }
      }
    }
  }
  return entries;
}

// Script paths inside the repo a hook command runs. A token with any other
// variable ($HOME, $(dirname ...)) is skipped: its value is unknown here.
function listCommandTargets(root, command) {
  const tokens = command.replace(/\$\{?CLAUDE_PROJECT_DIR\}?/g, root).replace(/["']/g, '').split(/\s+/).filter(Boolean);
  return tokens
    .map((token, index) => ({ token, path: isAbsolute(token) ? token : resolve(root, token), direct: index === 0 }))
    .filter(({ token, path }) => SCRIPT_EXTENSIONS.test(token) && !/[$~]/.test(token) && path.startsWith(`${root}/`));
}

const isExecutable = (path) => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

export function findHookGaps({ root, home }) {
  const findings = [];
  const entries = listHookEntries(root);
  const husky = listFiles(join(root, '.husky'), /^[^.]/)
    .filter((path) => !relative(root, path).startsWith('.husky/_/'))
    .flatMap((path) =>
      (findText(path) ?? '')
        .split('\n')
        .filter((line) => line.trim() && !line.trim().startsWith('#'))
        .map((command) => ({ file: relative(root, path), command: command.trim() })),
    );

  for (const { file, command } of [...entries, ...husky]) {
    for (const { path, direct } of listCommandTargets(root, command)) {
      const where = `${file}: ${command}`;
      if (!existsSync(path)) findings.push({ kind: 'hook-target-missing', where, detail: `runs ${relative(root, path)}, which does not exist` });
      else if (direct && !isExecutable(path)) findings.push({ kind: 'hook-not-executable', where, detail: `${relative(root, path)} is run directly but has no execute bit` });
    }
  }

  const seen = new Set();
  for (const { file, event, matcher, command } of entries) {
    const key = `${event}|${matcher}|${command}`;
    if (seen.has(key)) findings.push({ kind: 'hook-duplicate', where: `${file}: ${event} [${matcher}]`, detail: `runs twice: ${command}` });
    seen.add(key);
  }

  // lean-ctx tools run shell commands and edits past a hook that matches only the native tool.
  const leanContextEvidence =
    [join(root, '.mcp.json'), join(home, '.claude.json')].find((path) => (findText(path) ?? '').includes('lean-ctx')) ??
    entries.find(({ matcher }) => matcher.includes('mcp__lean-ctx__'))?.file;
  if (leanContextEvidence) {
    const bypasses = [
      { native: ['Bash'], tools: ['mcp__lean-ctx__ctx_shell', 'mcp__lean-ctx__shell'] },
      { native: ['Write', 'Edit'], tools: ['mcp__lean-ctx__ctx_patch', 'mcp__lean-ctx__ctx_call'] },
    ];
    for (const { file, event, matcher, command } of entries) {
      if (event !== 'PreToolUse') continue;
      const matches = (tool) => {
        try {
          return new RegExp(`^(?:${matcher || '.*'})$`).test(tool);
        } catch {
          return matcher.split('|').includes(tool);
        }
      };
      for (const { native, tools } of bypasses) {
        const skipped = tools.filter((tool) => !matches(tool));
        if (!native.some(matches) || !skipped.length) continue;
        findings.push({
          kind: 'hook-matcher-gap',
          where: `${file}: ${event} [${matcher}]`,
          detail: `lean-ctx is configured (${formatPath(leanContextEvidence, { root, home })}); ${skipped.join(', ')} calls skip ${command}`,
        });
      }
    }
  }
  return findings;
}

export function findOverlayOrphans(root) {
  const directory = join(root, '.claude', 'rules');
  return listFiles(directory, /\.local\.md$/)
    .filter((path) => !existsSync(path.replace(/\.local\.md$/, '.md')))
    .map((path) => ({ kind: 'overlay-orphan', where: relative(root, path), detail: `no base rule ${basename(path).replace(/\.local\.md$/, '.md')}; the overlay overrides nothing` }));
}

// A synced rule that differs from what the last `chore(skilly):` commit wrote.
// The next sync overwrites the edit.
export function findEditedRules(root, sources) {
  const findings = [];
  for (const { path, owner } of sources) {
    if (owner !== 'skilly') continue;
    // First parent only: a merged branch replays old sync commits out of order.
    // A merge counts as a sync when its branch holds a `chore(skilly):` commit on this file.
    const commits = (runGit(root, ['log', '--first-parent', '--format=%H%x09%P%x09%s', '--', path]) ?? '')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t'));
    const isSync = ([commit, parents, subject]) =>
      subject.startsWith('chore(skilly):') ||
      (parents.includes(' ') &&
        (runGit(root, ['log', '--format=%s', `${commit}^1..${commit}^2`, '--', path]) ?? '')
          .split('\n')
          .some((branchSubject) => branchSubject.startsWith('chore(skilly):')));
    const sync = commits.find(isSync)?.[0];
    if (!sync) continue;
    // `git diff --quiet` exits 1 on a difference; runGit turns that into null.
    if (runGit(root, ['diff', '--quiet', sync, '--', path]) === null) {
      findings.push({ kind: 'synced-rule-edited', where: path, detail: `changed since sync ${sync.slice(0, 7)}; the next sync overwrites the edit` });
    }
  }
  return findings;
}

// Links and backticked repo paths in instruction files that point nowhere.
export function findDeadPaths(root, sources) {
  const findings = [];
  for (const { path, owner } of sources) {
    if (owner === 'global') continue;
    const absolute = join(root, path);
    let fenced = false;
    (findText(absolute) ?? '').split('\n').forEach((line, index) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) return;
      const targets = [
        ...[...line.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]),
        ...[...line.matchAll(/`((?:\.agents|\.claude|docs)\/[^`\s]*)`/g)].map((match) => match[1]),
      ];
      for (const target of targets) {
        if (/^[a-z]+:|^#|[<>*{}$]/.test(target)) continue;
        const bare = target.replace(/#.*$/, '');
        let clean = bare;
        try {
          clean = decodeURIComponent(bare);
        } catch {
          // a bare % is a literal character, not an escape
        }
        if (!clean || [resolve(dirname(absolute), clean), resolve(root, clean)].some(existsSync)) continue;
        findings.push({ kind: 'dead-path', where: `${path}:${index + 1}`, detail: `${target} does not exist` });
      }
    });
  }
  return findings;
}

// A global skill or command with an installed skill's name: two bodies, one name.
export function findShadowedSkills({ root, home, skills }) {
  const findings = [];
  for (const { name } of skills) {
    const installed = realpathSync(join(root, '.agents', 'skills', name));
    const candidates = [join(home, '.claude', 'skills', name), join(home, '.claude', 'commands', `${name}.md`), join(root, '.claude', 'commands', `${name}.md`)];
    for (const candidate of candidates) {
      if (existsSync(candidate) && realpathSync(candidate) !== installed) {
        findings.push({ kind: 'skill-shadowed', where: formatPath(candidate, { root, home }), detail: `same name as installed skill .agents/skills/${name}` });
      }
    }
  }
  return findings;
}

// --- main --------------------------------------------------------------------------

export function audit(start = process.cwd(), home = homedir()) {
  const root = runGit(start, ['rev-parse', '--show-toplevel']);
  if (!root) return { consumer: false, reason: 'not a git repository' };
  // .skilly.json is the layout before .skilly/config.json; skilly migrates it on its next run.
  const skillyFile = parseJson(join(root, '.skilly', 'config.json')) ?? parseJson(join(root, '.skilly.json'));
  if (!skillyFile) return { consumer: false, reason: 'no .skilly/config.json: not a skilly consumer, nothing to audit' };

  const commonDirectory = runGit(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const mainCheckout = commonDirectory && basename(commonDirectory) === '.git' ? dirname(commonDirectory) : root;
  const reportFile = join(mainCheckout, '.temp', 'audit-skilly-workflow', `${new Date().toISOString().slice(0, 10)}-${basename(mainCheckout)}.html`);
  const ignored = runGit(mainCheckout, ['check-ignore', reportFile]) !== null;

  const bundles = skillyFile.bundles ?? [];
  const skills = listFiles(join(root, '.agents', 'skills'), /^SKILL\.md$/)
    .filter((path) => dirname(dirname(path)) === join(root, '.agents', 'skills'))
    .map((path) => ({ name: basename(dirname(path)), description: getDescription(findText(path)) }));
  const sources = listSources({ root, home, ownerNames: [...bundles, ...skills.map(({ name }) => name)] });
  const workflows = listFiles(join(root, '.github', 'workflows'), /\.ya?ml$/);

  // A hook listed twice repeats its findings; keep one of each.
  const findings = [
    ...findHookGaps({ root, home }),
    ...findOverlayOrphans(root),
    ...findEditedRules(root, sources),
    ...findDeadPaths(root, sources),
    ...findShadowedSkills({ root, home, skills }),
  ].filter((finding, index, all) => all.findIndex((other) => JSON.stringify(other) === JSON.stringify(finding)) === index);

  return {
    consumer: true,
    root,
    report: { file: reportFile, ignored },
    tier: skillyFile.tier ?? null,
    bundles,
    sources,
    skills,
    gates: listGates(root, workflows),
    findings,
  };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(audit(), null, 2));
}
