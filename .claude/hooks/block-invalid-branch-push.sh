#!/bin/bash
# Claude Code PreToolUse hook (matcher: Bash). Runs the Conventional Branch gate
# before the agent pushes or opens a PR, so a bad name fails before GitHub sees
# it. Unlike the pre-push hook it needs no npm install and --no-verify does not
# skip it. The rule itself lives in check-branch-name.mjs only.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
# ctx_shell carries its own cwd; Bash runs in the session cwd.
CWD=$(echo "$INPUT" | jq -r '.tool_input.cwd // .cwd // empty')

# Only a command in its own right: at the start or after ; & |, not quoted text.
echo "$COMMAND" | grep -qE "(^|[;&|])[[:space:]]*(git( -C [^ ]+)? push|gh pr create)( |$)" || exit 0

GATE="$(cd "$(dirname "$0")" && pwd)/check-branch-name.mjs"
cd "${CWD:-.}" || exit 0
node "$GATE" || exit 2
