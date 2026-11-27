#!/bin/bash
# The checks before a push. .husky/pre-push and block-unverified-push.sh run
# this file. CI runs the same commands as its own steps in ci.yml.
set -e
node scripts/checks/check-branch-name.mjs
node scripts/checks/naming/check.mjs
pnpm typecheck
pnpm exec vitest run --changed origin/main --passWithNoTests
node --test 'scripts/*.test.mjs' '.claude/hooks/*.test.mjs'
