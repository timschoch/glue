#!/bin/bash
# Claude Code PreToolUse hook (matcher: Bash). Blocks git commands that throw
# away work. Trunk safety lives elsewhere: the protect-trunk ruleset (force
# push, deletion) and the pre-push hook (direct push to main). Plain pushes
# and --force-with-lease stay allowed.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

PATTERNS=(
  "git reset --hard"
  "git clean -[a-zA-Z]*f"
  "git (checkout|restore) (-- )?\.( |$)"
  "git branch -D"
  "git push .*(-f|--force)( |$)"
)

for pattern in "${PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: '$COMMAND' matches destructive pattern '$pattern'. Ask the user to run it." >&2
    exit 2
  fi
done

exit 0
