#!/bin/bash
# Claude Code PreToolUse hook (matcher: Bash). Runs the Conventional Branch gate
# before the agent pushes or opens a PR, so a bad name fails before GitHub sees
# it. Unlike the pre-push hook it needs no npm install and --no-verify does not
# skip it. The rule itself lives in the verify skill's check-branch-name.mjs
# only. $1 names it where the repo keeps it somewhere else than the installed
# skill. A repo without the verify skill has no gate; a named gate must exist.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
# ctx_shell carries its own cwd; Bash runs in the session cwd.
CWD=$(echo "$INPUT" | jq -r '.tool_input.cwd // .cwd // empty')

# Only a command in its own right: at the start or after ; & |, not quoted text.
echo "$COMMAND" | grep -qE "(^|[;&|])[[:space:]]*(git( -C [^ ]+)? push|gh pr create)( |$)" || exit 0

cd "${CWD:-.}" || exit 0
ROOT=$(git rev-parse --show-toplevel 2> /dev/null) || exit 0
cd "$ROOT" || exit 0

if [ -n "$1" ]; then
  GATE="$1"
  [ -f "$GATE" ] || {
    echo "Branch name gate $GATE not found. Fix the path in .claude/settings.json." >&2
    exit 2
  }
else
  GATE=.agents/skills/verify/scripts/check-branch-name.mjs
  [ -f "$GATE" ] || exit 0
fi

node "$GATE" || exit 2
