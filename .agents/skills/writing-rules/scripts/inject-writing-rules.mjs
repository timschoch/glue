#!/usr/bin/env node
// PreToolUse hook: put the writing rules in front of whoever is about to write.
// Injects the sidecars beside this script (../rules): all.md plus plain.md or
// dense.md by path. Zero dependencies; holds no rule of its own.
// Wired by the setup-repo skill in .claude/settings.json on every write tool.
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RULES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'rules');

// ctx_call carries reads under the same tool name; the inner name tells a write from a read.
const CALL_WRITERS = new Set(['ctx_edit', 'ctx_patch']);
const leanCtxPaths = (input) => [input.path, ...(input.ops ?? []).map((op) => op?.path)];

const PATHS_BY_TOOL = {
  Write: (input) => [input.file_path],
  Edit: (input) => [input.file_path],
  NotebookEdit: (input) => [input.notebook_path],
  'mcp__lean-ctx__ctx_patch': leanCtxPaths,
  'mcp__lean-ctx__ctx_call': (input) =>
    CALL_WRITERS.has(input.name) ? leanCtxPaths(input.arguments ?? {}) : [],
};

// Synced trees are excluded: a fix made there dies at the next sync.
const SKIP = /(^|\/)(node_modules|\.temp|\.claude\/skills|\.claude\/rules)\//;
const DENSE = /(^|\/)(CLAUDE\.md|AGENTS\.md|SKILL\.md)$|(^|\/)docs\/agents\//;

export function styleFor(path) {
  if (!path.endsWith('.md') || SKIP.test(path)) return null;
  return DENSE.test(path) ? 'dense' : 'plain';
}

export function contextFor(path) {
  const style = styleFor(path);
  if (!style) return null;
  const rules = ['all.md', `${style}.md`].map((file) => readFileSync(join(RULES_DIR, file), 'utf8').trim());
  return [
    `Your writing rules for \`${path}\`, style \`${style}\` (writing-rules skill).`,
    'Follow them in this edit. Do not restate them in the file.',
    '',
    ...rules,
  ].join('\n');
}

function main() {
  let event;
  try {
    event = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return;
  }
  const paths = (PATHS_BY_TOOL[event.tool_name] ?? (() => []))(event.tool_input ?? {});
  const blocks = [...new Set(paths.filter(Boolean))].map(contextFor).filter(Boolean);
  if (!blocks.length) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: blocks.join('\n\n') },
    }),
  );
}

// Node loads the main module through its real path; argv[1] keeps the path as typed.
// `.claude/skills` is a symlink to `.agents/skills`, so compare real paths on both sides.
const isMain = () => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isMain()) main();
