#!/bin/bash
# Claude Code PreToolUse hook (matcher: Bash). Runs the verify push stage before
# the agent's git push whenever git's own pre-push hook will not run it: a fresh
# worktree has no installed hooks until npm install, and --no-verify skips them.
# The steps live in the verify skill only. $1 names verify.mjs where the repo
# keeps it somewhere else than the installed skill.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
# ctx_shell carries its own cwd; Bash runs in the session cwd.
CWD=$(echo "$INPUT" | jq -r '.tool_input.cwd // .cwd // empty')

# Only a command in its own right: at the start or after ; & |, not quoted text.
echo "$COMMAND" | grep -qE "(^|[;&|])[[:space:]]*git( -C [^ ]+)? push( |$)" || exit 0

cd "${CWD:-.}" || exit 0
ROOT=$(git rev-parse --show-toplevel 2> /dev/null) || exit 0
cd "$ROOT" || exit 0

VERIFY="${1:-.agents/skills/verify/scripts/verify.mjs}"
[ -f "$VERIFY" ] || exit 0

# git runs the stage itself: the hook is installed and the push does not skip it.
if [ -f "$(git rev-parse --git-path hooks)/pre-push" ] && ! echo "$COMMAND" | grep -q -- "--no-verify"; then
  exit 0
fi

node "$VERIFY" push >&2 || exit 2
