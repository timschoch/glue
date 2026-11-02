#!/usr/bin/env node
// Claude Code PostToolUse hook (ADR-0006 decision 4): `oxlint --fix`, then
// Prettier, on each file the agent edited. The pre-commit hook runs it too,
// with the staged files as arguments (ADR-0006 decision 5), so a Consumer
// needs no lint-staged. Silent when the files are clean. With errors left it
// exits 2, so Claude Code shows them to the agent. A repo without oxlint or
// Prettier in node_modules/.bin skips that tool.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LINTED = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;
// ctx_call carries reads under the same tool name; the inner name tells a write from a read.
const CALL_WRITERS = new Set(['ctx_edit', 'ctx_patch']);
const leanCtxPaths = (input) => [input.path, ...(input.ops ?? []).map((op) => op?.path)];
const PATHS_BY_TOOL = {
  Write: (input) => [input.file_path],
  Edit: (input) => [input.file_path],
  MultiEdit: (input) => [input.file_path],
  'mcp__lean-ctx__ctx_patch': leanCtxPaths,
  'mcp__lean-ctx__ctx_call': (input) => (CALL_WRITERS.has(input.name) ? leanCtxPaths(input.arguments ?? {}) : []),
};
const BLOCKING_EXIT = 2;

/** The paths `tool` wrote, from its `input`. */
export function editedPaths(tool, input) {
  return [...new Set((PATHS_BY_TOOL[tool]?.(input ?? {}) ?? []).filter(Boolean))];
}

function lint(root, path) {
  const problems = [];
  const bin = (name) => [join(root, 'node_modules', '.bin', name)].find(existsSync);
  const oxlint = bin('oxlint');
  if (oxlint && LINTED.test(path)) {
    const result = spawnSync(oxlint, ['--fix', path], { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) problems.push(`${result.stdout}${result.stderr}`.trim());
  }
  const prettier = bin('prettier');
  if (prettier) {
    const result = spawnSync(prettier, ['--write', '--ignore-unknown', '--log-level', 'warn', path], { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) problems.push(result.stderr.trim());
  }
  return problems;
}

// Staged paths are relative to the repo root, the hook's working directory.
function fromArguments(paths) {
  return { root: process.cwd(), paths: paths.map((path) => resolve(path)) };
}

function fromToolInput() {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  return { root, paths: editedPaths(input.tool_name, input.tool_input).map((path) => resolve(input.cwd ?? root, path)) };
}

function main() {
  const args = process.argv.slice(2);
  const { root, paths } = args.length ? fromArguments(args) : fromToolInput();
  const problems = paths.filter(existsSync).flatMap((path) => lint(root, path));
  if (!problems.length) return;
  console.error(problems.join('\n\n'));
  process.exit(BLOCKING_EXIT);
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
