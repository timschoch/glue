#!/usr/bin/env bash
# Read-only planner. NEVER mutates the tracker.
# Prints in-progress issues whose claim is STALE, one per line: "#<n>\t<title>".
#
# A claim is stale iff ALL hold:
#   - the issue is open and labeled `in-progress`
#   - it has NO open linked PR (linked = an open PR referencing #N in its
#     title/body, OR whose head branch == the branch named in the claim comment)
#   - the `in-progress` label is older than the threshold (age = the latest
#     `labeled` timeline event for `in-progress`)
#
# Usage: stale-claims.sh [threshold_hours]
#   threshold_hours defaults to $STALE_CLAIM_HOURS, else 24.
set -euo pipefail
export LC_ALL=C   # deterministic byte-wise sort/compare for ISO-8601 timestamps

label="in-progress"
hours="${1:-${STALE_CLAIM_HOURS:-24}}"

# Cutoff as ISO-8601 UTC. Same-zone ISO strings compare lexicographically ==
# chronologically, so no per-timestamp epoch math is needed. GNU date first,
# then BSD/macOS date.
cutoff="$(date -u -d "$hours hours ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
  || date -u -v-"${hours}"H +%Y-%m-%dT%H:%M:%SZ)"

# Open PRs as "<number>\t<headRef>\t<title+body>" (one @tsv-escaped record/line).
prs="$(gh pr list --state open --limit 1000 --json number,title,body,headRefName \
  -q '.[] | [.number, .headRefName, (.title + " " + (.body // ""))] | @tsv')"
# Their head branches, one per line, computed once (not in a pipe at the match
# site — a `cut | grep -q` there would SIGPIPE cut and, under pipefail, silently
# read as "no match").
pr_heads="$(cut -f2 <<<"$prs")"

# Open in-progress issues as "<number>\t<title>".
issues="$(gh issue list --label "$label" --state open --limit 1000 --json number,title \
  -q '.[] | [.number, .title] | @tsv')"

[[ -z "$issues" ]] && exit 0

while IFS=$'\t' read -r n title; do
  [[ -z "$n" ]] && continue

  # Label age: newest `labeled` event for `in-progress`. Empty (no record) →
  # treat as not-yet-stale and skip, so we never reap on missing data.
  labeled_at="$(gh api "repos/{owner}/{repo}/issues/$n/timeline" --paginate \
    -q ".[] | select(.event==\"labeled\" and .label.name==\"$label\") | .created_at" \
    2>/dev/null | sort | tail -n1 || true)"
  [[ -z "$labeled_at" ]] && continue
  [[ "$labeled_at" > "$cutoff" ]] && continue   # claim still fresh

  # Linked open PR by #N reference (word-bounded, so #10 != #104)?
  if [[ -n "$prs" ]] && grep -qE "(^|[^0-9])#$n([^0-9]|$)" <<<"$prs"; then
    continue
  fi

  # Linked open PR by the branch named in the claim comment?
  branch="$(gh issue view "$n" --json comments -q '.comments[].body' 2>/dev/null \
    | sed -nE 's/.*in-progress[[:space:]]+—[[:space:]]+([^[:space:]]+).*/\1/p' \
    | tail -n1 || true)"
  if [[ -n "$branch" ]] && grep -qxF "$branch" <<<"$pr_heads"; then
    continue
  fi

  printf '#%s\t%s\n' "$n" "$title"
done <<<"$issues"
