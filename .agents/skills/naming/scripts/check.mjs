#!/usr/bin/env node
// Gate check `naming`: the machine-checkable half of the naming Rule, over the
// files a PR changes. The hub's `rules/naming.sh` runs it in CI; a consumer runs
// the same file from `.agents/skills/naming/scripts/` in its `verify` push stage.
//   node check.mjs [files...]   no files: every file the branch adds or changes
//                               over its base branch
// Regex-only, on comment- and string-blanked source — the
// gate runs in a consumer checkout that installs nothing, so there is no parser
// to lean on. Every check stays conservative: a missed bad name costs less than
// a false FAIL, which teaches people to ignore the gate.
// Every word list — short words, noise words, verb synonyms, env roles, the
// discriminant key and the allow entries, vendored paths included — lives in
// the naming skill's `references/naming.json`, merged with stack files and the
// consumer's `.skilly/naming.json` by `config.mjs` next to this file. Only
// the single-letter ban is in code.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileAllow, loadNamingConfig } from './config.mjs';

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ENV_EXAMPLE = /^\.env(\.[^.]+)*\.(example|sample)$/;
const ENV_NAME = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;
const VALUE_KINDS = new Set(['binding', 'function', 'param']);
const NAMED_KINDS = new Set(['binding', 'function', 'type', 'interface', 'class', 'enum']);
const TYPE_KINDS = new Set(['type', 'interface', 'class']);

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The cases `artifacts.file.case` and `artifacts.folder.case` may name: the
// pattern a name must match, and how to spell a suggestion from its words.
const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1);
const CASES = {
  kebab: { pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/, spell: (words) => words.join('-') },
  snake_case: { pattern: /^[a-z0-9]+(_[a-z0-9]+)*$/, spell: (words) => words.join('_') },
  camelCase: {
    pattern: /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/,
    spell: ([first, ...rest]) => first + rest.map(capitalize).join(''),
  },
  PascalCase: { pattern: /^([A-Z][a-z0-9]*)+$/, spell: (words) => words.map(capitalize).join('') },
};

// One case name or a list of them; a name passes when it matches any.
function toCaseNames(value, key) {
  const names = [value ?? 'kebab'].flat();
  for (const name of names) {
    if (!CASES[name]) throw new Error(`${key} "${name}" is not one of ${Object.keys(CASES).join(', ')}`);
  }
  return names;
}

// The config's word lists, turned into the shapes the checks below match on.
function toCheckLists(config) {
  const shortWords = {};
  for (const [abbreviation, word] of Object.entries(config.shortWords ?? {})) {
    shortWords[abbreviation.toLowerCase()] = word;
  }
  const noiseWords = config.noiseWords ?? [];
  const roles = config.artifacts?.env?.roles ?? [];
  return {
    shortWords,
    // Longest prefix first: getAll/fetchAll must be read before their bare stems.
    synonyms: Object.entries(config.synonyms ?? {}).sort(([left], [right]) => right.length - left.length),
    noiseSuffix: noiseWords.length ? new RegExp(`(${noiseWords.map(escapeRegExp).join('|')})$`) : null,
    envRoles: roles,
    envFor: roles.length
      ? new RegExp(`^[A-Z0-9]+(_[A-Z0-9]+)*_(${roles.map(escapeRegExp).join('|')})_FOR_[A-Z0-9]+$`)
      : null,
    discriminant: config.discriminant,
    fileCases: toCaseNames(config.artifacts?.file?.case, 'artifacts.file.case'),
    folderCases: toCaseNames(config.artifacts?.folder?.case, 'artifacts.folder.case'),
  };
}

// --- source shaping ---------------------------------------------------------

// Blanks comment bodies and string/template contents to spaces, keeping every
// byte offset and newline. Findings stay on their real line, and the regexes
// below never see prose or literals.
export function blankNoise(source) {
  const out = source.split('');
  const blank = (from, to) => {
    for (let index = from; index < to && index < out.length; index++) if (out[index] !== '\n') out[index] = ' ';
  };
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      let end = source.indexOf('\n', index);
      if (end === -1) end = source.length;
      blank(index, end);
      index = end;
      continue;
    }
    if (char === '/' && next === '*') {
      const found = source.indexOf('*/', index + 2);
      const end = found === -1 ? source.length : found + 2;
      blank(index, end);
      index = end;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === '\\') {
          cursor += 2;
          continue;
        }
        if (source[cursor] === char) break;
        if (char !== '`' && source[cursor] === '\n') break; // unterminated quote: stop at the line end
        cursor++;
      }
      blank(index + 1, cursor);
      index = cursor + 1;
      continue;
    }
    index++;
  }
  return out.join('');
}

const lineOf = (source, index) => {
  let line = 1;
  for (let cursor = 0; cursor < index && cursor < source.length; cursor++) if (source[cursor] === '\n') line++;
  return line;
};

const PAIRS = { '(': ')', '{': '}', '[': ']' };

function matchBracket(source, open) {
  const close = PAIRS[source[open]];
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === source[open]) depth++;
    else if (source[index] === close && --depth === 0) return index;
  }
  return -1;
}

function matchParenBackward(source, close) {
  let depth = 0;
  for (let index = close; index >= 0; index--) {
    if (source[index] === ')') depth++;
    else if (source[index] === '(' && --depth === 0) return index;
  }
  return -1;
}

// Splits a parameter or destructuring list on its top-level commas, carrying
// each part's offset so findings keep a real position.
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if ('([{<'.includes(char)) depth++;
    else if (')]}'.includes(char) || (char === '>' && text[index - 1] !== '=')) depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) {
      parts.push({ text: text.slice(start, index), offset: start });
      start = index + 1;
    }
  }
  parts.push({ text: text.slice(start), offset: start });
  return parts;
}

// The locals a binding introduces: a plain identifier, or the names a one-level
// destructuring pattern creates. Nested patterns fall through unnamed. An object
// key taken without a rename (`{ req }`) is left out: the object's owner picked
// that name, and the gate checks it where it is declared.
function bindingNames(text, base) {
  const trimmed = text.trimStart();
  const lead = base + (text.length - trimmed.length);
  const open = trimmed[0];
  if (open === '{' || open === '[') {
    const close = matchBracket(trimmed, 0);
    if (close === -1) return [];
    const names = [];
    for (const part of splitTopLevel(trimmed.slice(1, close))) {
      const beforeDefault = part.text.split('=')[0];
      const colon = open === '{' ? beforeDefault.lastIndexOf(':') : -1;
      if (open === '{' && colon === -1 && !beforeDefault.trimStart().startsWith('...')) continue;
      const tail = colon === -1 ? beforeDefault : beforeDefault.slice(colon + 1);
      const match = tail.match(/^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)\s*$/);
      if (match) names.push({ name: match[1], index: lead + 1 + part.offset + colon + 1 + tail.indexOf(match[1]) });
    }
    return names;
  }
  const match = trimmed.match(/^(?:\.\.\.)?([A-Za-z_$][\w$]*)/);
  return match ? [{ name: match[1], index: lead + match[0].length - match[1].length }] : [];
}

const FUNCTION_INITIALIZER =
  /^(?:async\s+)?(?:function\b|(?:\([^;]{0,300}?\)|<[^;]{0,100}?>\s*\([^;]{0,300}?\)|[A-Za-z_$][\w$]*)\s*(?::[^;=]{0,100})?=>)/;

// --- declaration harvesting -------------------------------------------------

// Every name the file declares, as { name, index, kind, isFunction }. Kinds are
// what the checks below key off; positions are offsets into the blanked source.
export function declarations(source) {
  const found = [];
  const seen = new Set();
  const add = (name, index, kind, isFunction = false) => {
    const key = `${name}:${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ name, index, kind, isFunction });
  };
  const addParams = (open) => {
    const close = matchBracket(source, open);
    if (close === -1) return;
    const inner = source.slice(open + 1, close);
    if (!inner.trim()) return;
    for (const part of splitTopLevel(inner)) {
      for (const entry of bindingNames(part.text, open + 1 + part.offset)) add(entry.name, entry.index, 'param');
    }
  };

  for (const match of source.matchAll(/\b(?:const|let|var)\s+/g)) {
    const after = match.index + match[0].length;
    const rest = source.slice(after, after + 2000);
    if (/^enum\b/.test(rest)) continue; // `const enum X` is an enum, not a binding
    const simple = rest.match(/^[A-Za-z_$][\w$]*\s*(?::[^=;]{0,200})?=\s*/);
    const isFunction = simple ? FUNCTION_INITIALIZER.test(rest.slice(simple[0].length, simple[0].length + 400)) : false;
    for (const entry of bindingNames(rest, after)) add(entry.name, entry.index, 'binding', isFunction);
  }

  for (const match of source.matchAll(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(/g)) {
    const head = match[0].slice(0, -1);
    if (match[1]) add(match[1], match.index + head.lastIndexOf(match[1]), 'function', true);
    addParams(match.index + match[0].length - 1);
  }

  for (const match of source.matchAll(/\bcatch\s*\(/g)) addParams(match.index + match[0].length - 1);

  for (const match of source.matchAll(/=>/g)) {
    let cursor = match.index - 1;
    while (cursor >= 0 && /\s/.test(source[cursor])) cursor--;
    if (source[cursor] !== ')') {
      // Step over a return type annotation — `(value: string): Result => …`.
      let scan = cursor;
      while (scan >= 0 && /[\w$.<>|&[\] ]/.test(source[scan])) scan--;
      if (source[scan] === ':') {
        let before = scan - 1;
        while (before >= 0 && /\s/.test(source[before])) before--;
        if (source[before] === ')') cursor = before;
      }
    }
    if (source[cursor] === ')') {
      const open = matchParenBackward(source, cursor);
      if (open !== -1) addParams(open);
      continue;
    }
    const single = source.slice(0, cursor + 1).match(/([A-Za-z_$][\w$]*)$/);
    if (!single) continue;
    let before = cursor - single[1].length;
    while (before >= 0 && /\s/.test(source[before])) before--;
    // A bare single-param arrow only follows an opener; anything else is a type.
    if (before >= 0 && !'(,=;{[\n'.includes(source[before])) continue;
    add(single[1], cursor + 1 - single[1].length, 'param');
  }

  for (const match of source.matchAll(/\b(interface|type|class|enum)\s+([A-Za-z_$][\w$]*)/g)) {
    if (/\bimport\s+$/.test(source.slice(Math.max(0, match.index - 10), match.index))) continue;
    const kind = match[1] === 'enum' ? 'enum' : match[1];
    add(match[2], match.index + match[0].lastIndexOf(match[2]), kind);
  }
  return found;
}

// --- checks -----------------------------------------------------------------

const kebab = (text) =>
  text
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();

// Framework spellings — Next.js dynamic segments, route groups, parallel slots,
// private folders, __tests__ — are stripped before the case test, not exempted
// from it. The extension goes after, so `[...slug]` keeps its dots until then
// and a route folder like `llms.txt` is tested as `llms`.
const bareName = (segment) =>
  segment
    .replace(/^[_+@]+/, '')
    .replace(/^\((.*)\)$/, '$1')
    .replace(/\[\[?[^\]]*\]\]?/g, '')
    .replace(/^[-_]+|[-_]+$/g, '')
    .split('.')[0];

// A finding when `bare` matches none of `cases`; the suggestion is spelled in the first.
function caseFinding(kind, shown, bare, cases, key) {
  if (!bare || cases.some((name) => CASES[name].pattern.test(bare))) return [];
  const words = kebab(bare).split('-').filter(Boolean);
  return [
    {
      line: 1,
      name: shown,
      rule: 'file-case',
      message: `${kind} "${shown}" does not match ${key} (${cases.join(', ')})`,
      suggestion: CASES[cases[0]].spell(words),
    },
  ];
}

function fileCaseFindings(path, lists) {
  const segments = path.split('/').filter((segment) => segment && segment !== '.');
  const name = segments.pop();
  const out = [];
  for (const segment of segments) {
    if (segment.startsWith('.')) continue;
    out.push(
      ...caseFinding('directory', segment, bareName(segment), lists.folderCases, 'artifacts.folder.case'),
    );
  }
  out.push(...caseFinding('file', name, bareName(name), lists.fileCases, 'artifacts.file.case'));
  return out;
}

function identifierFindings(source, isTypeScript, lists) {
  const out = [];
  for (const { name, index, kind, isFunction } of declarations(source)) {
    const line = lineOf(source, index);
    const report = (finding) => out.push({ line, name, ...finding });
    const word = lists.shortWords[name.toLowerCase()];
    if (VALUE_KINDS.has(kind)) {
      if (name.length === 1 && name !== '_' && name !== '$') {
        report({ rule: 'short-word', message: `"${name}" is a single letter`, suggestion: 'a whole word' });
      } else if (word) {
        report({ rule: 'short-word', message: `"${name}" is an abbreviation`, suggestion: word });
      }
    }
    if (NAMED_KINDS.has(kind) && kind !== 'param' && lists.noiseSuffix) {
      const noise = name.match(lists.noiseSuffix);
      if (noise && name !== noise[1]) {
        report({
          rule: 'noise-word',
          message: `"${name}" ends in the filler word "${noise[1]}"`,
          suggestion: `name what it is, without "${noise[1]}"`,
        });
      }
    }
    if (kind === 'enum' && isTypeScript) {
      report({
        rule: 'enum',
        message: `enum "${name}"`,
        suggestion: 'a string union, or a const object plus a derived type',
      });
    }
    if (TYPE_KINDS.has(kind) && /^[IT][A-Z]/.test(name)) {
      report({
        rule: 'type-prefix',
        message: `"${name}" carries a type-marker prefix`,
        suggestion: name.slice(1),
      });
    }
    if (kind === 'function' || (kind === 'binding' && isFunction)) {
      for (const [prefix, verb] of lists.synonyms) {
        if (!name.startsWith(prefix) || !/^[A-Z0-9_]|^$/.test(name.slice(prefix.length))) continue;
        const rest = name.slice(prefix.length);
        const suggestion = verb === 'to' ? `to${rest} or parse${rest}` : `${verb}${rest}`;
        report({ rule: 'verb-synonym', message: `"${name}" says ${prefix}, the repo says ${verb}`, suggestion });
        break;
      }
    }
  }
  return out;
}

// A `type:` discriminant is a warning, not a failure: the word is not wrong,
// it just collides with the language's own `type`.
function discriminantFindings(source, discriminant) {
  const out = [];
  if (!discriminant || discriminant === 'type') return out;
  for (const match of source.matchAll(/\b(?:interface|type)\s+[A-Za-z_$][\w$]*[^;{]*?\{/g)) {
    const open = match.index + match[0].length - 1;
    const close = matchBracket(source, open);
    if (close === -1) continue;
    for (const property of source.slice(open, close).matchAll(/(?:readonly\s+)?\btype\s*\??\s*:\s*['"`]/g)) {
      out.push({
        line: lineOf(source, open + property.index),
        name: 'type',
        rule: 'discriminant',
        message: 'a string-literal property named "type"',
        suggestion: discriminant,
      });
    }
  }
  return out;
}

function envFindings(source, lists) {
  const out = [];
  source.split('\n').forEach((text, offset) => {
    const match = text.match(/^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=/);
    if (!match || text.trimStart().startsWith('#')) return;
    const name = match[1];
    const line = offset + 1;
    if (!ENV_NAME.test(name)) {
      out.push({
        line,
        name,
        rule: 'env-shape',
        message: `"${name}" is not UPPER_SNAKE_CASE`,
        suggestion: name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase(),
      });
      return;
    }
    if (name.includes('_FOR_') && lists.envFor && !lists.envFor.test(name)) {
      const roles = lists.envRoles.join('|');
      out.push({
        line,
        name,
        rule: 'env-shape',
        message: `"${name}" does not read <SERVICE>_(${roles})_FOR_<CONSUMER>`,
        suggestion: `SERVICE_${lists.envRoles[0]}_FOR_CONSUMER`,
      });
    }
  });
  return out;
}

// --- entry points -----------------------------------------------------------

// `allow` in the config: named entries, each a set of path and name regexes
// plus the rules it silences. A finding is dropped when every regex list the
// entry gives matches it and the entry names its rule. An entry with only
// paths and rules "*" skips the file before it is read.
export function validateNaming({ root, files, config = loadNamingConfig(root), allow = config.allow }) {
  const lists = toCheckLists(config);
  const entries = compileAllow(allow);
  const matches = (patterns, text) => patterns.some((pattern) => pattern.test(text));
  const isAllowed = (finding) =>
    entries.some(
      ({ paths, names, rules }) =>
        (!paths || matches(paths, finding.file)) &&
        (!names || (finding.name !== undefined && matches(names, finding.name))) &&
        (rules === '*' || rules.includes(finding.rule)),
    );
  const isSkipped = (file) =>
    entries.some(({ paths, names, rules }) => rules === '*' && paths && !names && matches(paths, file));
  const failures = [];
  const warnings = [];

  for (const file of files) {
    if (isSkipped(file)) continue;
    const name = file.split('/').pop();
    const path = join(root, file);
    if (!existsSync(path)) continue;
    // Findings are harvested per declaration kind; a reader wants them by line.
    const found = [];
    const collect = (findings) => found.push(...findings.map((finding) => ({ file, ...finding })));
    const flush = () => {
      found.sort((left, right) => left.line - right.line);
      failures.push(...found.filter((finding) => !isAllowed(finding)));
    };

    if (ENV_EXAMPLE.test(name)) {
      collect(envFindings(readFileSync(path, 'utf8'), lists));
      flush();
      continue;
    }
    const extension = extname(name);
    if (!CODE_EXTENSIONS.has(extension)) continue;

    const source = blankNoise(readFileSync(path, 'utf8'));
    const isTypeScript = extension === '.ts' || extension === '.tsx';
    collect(fileCaseFindings(file, lists));
    collect(identifierFindings(source, isTypeScript, lists));
    flush();
    if (isTypeScript) {
      for (const finding of discriminantFindings(source, lists.discriminant)) {
        if (!isAllowed({ file, ...finding })) warnings.push({ file, ...finding });
      }
    }
  }
  return { failures, warnings };
}

const format = (level, { file, line, rule, message, suggestion }) =>
  `${level} ${file}:${line} ${rule}: ${message}${suggestion ? ` — use ${suggestion}` : ''}`;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });

// The base branch: GITHUB_BASE_REF on pull_request events, then DEFAULT_BRANCH,
// then origin/HEAD, then main. Its origin ref when fetched, else the local one.
function baseRef() {
  const branch =
    process.env.GITHUB_BASE_REF ||
    process.env.DEFAULT_BRANCH ||
    git('symbolic-ref', '--short', 'refs/remotes/origin/HEAD').stdout.trim().replace(/^origin\//, '') ||
    'main';
  return git('rev-parse', '--verify', '--quiet', `origin/${branch}`).status === 0 ? `origin/${branch}` : branch;
}

// Files the branch adds or changes over its base. Untouched files are out of
// scope by construction: the gate never asks for a rename sweep.
function changedFiles(ref) {
  const diff = git('diff', '--name-only', '--diff-filter=ACMR', `${ref}...HEAD`);
  if (diff.status !== 0) throw new Error(`git diff over ${ref} failed: ${diff.stderr.trim()}`);
  return diff.stdout.split('\n').filter(Boolean);
}

function main(argv) {
  let files = argv;
  if (!files.length) {
    const ref = baseRef();
    files = changedFiles(ref);
    if (!files.length) {
      console.log(`no files changed over ${ref} — nothing to check`);
      return 0;
    }
  }
  const root = process.cwd();
  const { failures, warnings } = validateNaming({ root, files });
  for (const finding of failures) console.log(format('FAIL', finding));
  for (const finding of warnings) console.log(format('WARN', finding));
  console.log(`naming: ${plural(failures.length, 'failure')}, ${plural(warnings.length, 'warning')} over ${plural(files.length, 'file')}`);
  return failures.length ? 1 : 0;
}

// realpath: import.meta.url resolves symlinks, argv[1] does not.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (failure) {
    console.error(failure.message);
    process.exit(1);
  }
}
