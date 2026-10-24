#!/usr/bin/env node
// Gate check `mermaid`: every mermaid diagram in the .md, .mdx and .mmd files a
// branch changes must parse. A broken one renders as an error box on GitHub.
//   node check-mermaid.mjs [files...]   no files: the changed files over the base
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultBranch } from './default-branch.mjs';

const DIAGRAM_EXTENSIONS = new Set(['.md', '.mdx', '.mmd']);
// A CommonMark fence: up to 3 spaces, 3+ backticks or tildes, the info string.
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

// The diagrams in one file: a `.mmd` file is one diagram, Markdown one per fence
// whose language is mermaid. Every fence is skipped whole, so a mermaid example
// inside a ````md fence is no diagram. `line`: the first line in the file, 1-based.
export function listDiagrams(file, text) {
  if (!DIAGRAM_EXTENSIONS.has(extname(file))) return [];
  if (extname(file) === '.mmd') return [{ line: 1, source: text }];
  const lines = text.split('\n');
  const diagrams = [];
  for (let index = 0; index < lines.length; index++) {
    const open = FENCE_OPEN.exec(lines[index]);
    if (!open) continue;
    const [, fence, info] = open;
    if (fence[0] === '`' && info.includes('`')) continue;
    const close = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`);
    let end = index + 1;
    while (end < lines.length && !close.test(lines[end])) end++;
    if (info.trim().split(/\s+/)[0].toLowerCase() === 'mermaid') {
      diagrams.push({ line: index + 2, source: lines.slice(index + 1, end).join('\n') });
    }
    index = end;
  }
  return diagrams;
}

// Imports mermaid from the repo at `root`. Its parser needs a DOM, so this sets
// the global window and document from jsdom. Null when the repo lacks either.
export async function findMermaid(root) {
  const require = createRequire(join(root, 'package.json'));
  let paths;
  try {
    paths = { jsdom: require.resolve('jsdom'), mermaid: require.resolve('mermaid') };
  } catch {
    return null;
  }
  const { JSDOM } = await import(pathToFileURL(paths.jsdom).href);
  const { window } = new JSDOM('');
  globalThis.window = window;
  globalThis.document = window.document;
  const { default: mermaid } = await import(pathToFileURL(paths.mermaid).href);
  return mermaid;
}

// One finding per diagram that fails to parse. A parse error names its line
// inside the diagram; the finding moves it to the line in the file and keeps
// the rest: the source with a caret under the error, then what was expected.
export async function validateMermaid(diagrams, mermaid) {
  const failures = [];
  for (const { file, line, source } of diagrams) {
    try {
      await mermaid.parse(source);
    } catch (error) {
      const message = String(error.message ?? error);
      const innerLine = /on line (\d+)/.exec(message);
      const parts = message.split('\n').filter((part) => part.trim());
      const detail = (innerLine ? parts.slice(1) : parts).join('\n    ');
      failures.push({ file, line: line + (innerLine ? Number(innerLine[1]) - 1 : 0), message: detail });
    }
  }
  return failures;
}

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });

// The base branch: GITHUB_BASE_REF on pull_request events, else the default
// branch. Its origin ref when fetched, else the local one.
function baseRef() {
  const branch = process.env.GITHUB_BASE_REF || defaultBranch();
  return git('rev-parse', '--verify', '--quiet', `origin/${branch}`).status === 0 ? `origin/${branch}` : branch;
}

function changedFiles(ref) {
  const diff = git('diff', '--merge-base', '--name-only', '--diff-filter=ACMR', ref);
  if (diff.status !== 0) throw new Error(`git diff over ${ref} failed: ${diff.stderr.trim()}`);
  return diff.stdout.split('\n').filter(Boolean);
}

async function main(argv) {
  const root = process.cwd();
  const diagrams = (argv.length ? argv : changedFiles(baseRef()))
    .filter((file) => DIAGRAM_EXTENSIONS.has(extname(file)))
    .flatMap((file) => listDiagrams(file, readFileSync(join(root, file), 'utf8')).map((diagram) => ({ file, ...diagram })));
  if (!diagrams.length) {
    console.log('mermaid: no changed diagrams');
    return 0;
  }
  const mermaid = await findMermaid(root);
  if (!mermaid) {
    console.log('mermaid: skipped, the repo lacks the mermaid or jsdom package. Install: npm i -D mermaid jsdom');
    return 0;
  }
  const failures = await validateMermaid(diagrams, mermaid);
  for (const { file, line, message } of failures) console.log(`FAIL ${file}:${line}\n    ${message}`);
  console.log(`mermaid: ${failures.length} of ${diagrams.length} diagrams fail to parse`);
  return failures.length ? 1 : 0;
}

// realpath: import.meta.url resolves symlinks, argv[1] does not.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.exit(await main(process.argv.slice(2)));
  } catch (failure) {
    console.error(failure.message);
    process.exit(1);
  }
}
