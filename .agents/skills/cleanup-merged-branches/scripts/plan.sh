#!/usr/bin/env bash
# Read-only planner. NEVER deletes anything.
# Prints branches that are safe to delete, one per line: "<branch>\t#<pr>\t<title>".
#
# A branch is printed only if ALL hold:
#   - it still exists on the remote
#   - it has a MERGED PR
#   - it has NO open PR
#   - it is not protected (default branch or staging)
#
# Usage: plan.sh [remote]   (remote defaults to "origin")
set -euo pipefail

remote="${1:-origin}"
default="$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)"

# Head-branch name sets (one name per line).
existing="$(git ls-remote --heads "$remote" | sed 's#.*refs/heads/##' | sort -u)"
open_prs="$(gh pr list --state open --limit 1000 --json headRefName -q '.[].headRefName' | sort -u)"

# Never-delete set. Extend here if more protected names are needed.
is_protected() { [[ "$1" == "$default" || "$1" == "staging" ]]; }

# Walk merged PRs; emit branches that survive every filter. awk dedups by branch
# (a branch can back more than one merged PR).
gh pr list --state merged --limit 1000 --json headRefName,number,title \
  -q '.[] | [.headRefName, .number, .title] | @tsv' \
| sort -u \
| while IFS=$'\t' read -r branch number title; do
    [[ -z "$branch" ]] && continue
    grep -qxF "$branch" <<<"$existing" || continue   # must still exist on remote
    grep -qxF "$branch" <<<"$open_prs" && continue   # skip: has an open PR
    is_protected "$branch" && continue               # skip: protected name
    printf '%s\t#%s\t%s\n' "$branch" "$number" "$title"
  done \
| awk -F'\t' '!seen[$1]++'
