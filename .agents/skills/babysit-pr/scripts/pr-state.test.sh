#!/usr/bin/env bash
# Fixture test for pr-state.sh. Stubs `gh` on PATH and runs inside a throwaway
# git repo carrying a `.skilly/config.json`, so the reviewer set is exercised
# the way a consumer repo supplies it. Run: bash pr-state.test.sh
#
# PR 1 (open) covers:
#   reviews   alice COMMENTED, renovate COMMENTED, octobot[bot] COMMENTED,
#             alice PENDING -> PENDING dropped, renovate flagged isBot from the
#             config alone, octobot[bot] flagged from its suffix, alice human
#   threads   T_new (2026-09-03), T_old (2026-09-01) -> --since drops T_old
#   commits   lastPushAt is the newest committedDate, not the first
# PR 2 (merged) covers the terminal state.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

export FIXTURES="$tmp/fixtures"
mkdir -p "$FIXTURES"

cat >"$FIXTURES/pr1.json" <<'JSON'
{
  "number": 1,
  "url": "https://github.com/acme/widgets/pull/1",
  "author": { "login": "tim" },
  "state": "OPEN",
  "mergeable": "MERGEABLE",
  "mergeStateStatus": "BLOCKED",
  "reviewDecision": "CHANGES_REQUESTED",
  "headRefOid": "abc1234",
  "commits": [
    { "committedDate": "2026-09-02T10:00:00Z" },
    { "committedDate": "2026-09-01T10:00:00Z" }
  ],
  "reviews": [
    { "author": { "login": "alice" },        "state": "CHANGES_REQUESTED", "submittedAt": "2026-09-03T11:00:00Z" },
    { "author": { "login": "renovate" },     "state": "COMMENTED",         "submittedAt": "2026-09-03T11:30:00Z" },
    { "author": { "login": "octobot[bot]" }, "state": "COMMENTED",         "submittedAt": "2026-09-03T12:00:00Z" },
    { "author": { "login": "alice" },        "state": "PENDING",           "submittedAt": "2026-09-03T13:00:00Z" }
  ],
  "statusCheckRollup": [
    { "name": "verify", "status": "COMPLETED", "conclusion": "FAILURE",
      "detailsUrl": "https://github.com/acme/widgets/actions/runs/555/job/9" }
  ]
}
JSON

cat >"$FIXTURES/pr2.json" <<'JSON'
{
  "number": 2,
  "url": "https://github.com/acme/widgets/pull/2",
  "author": { "login": "tim" },
  "state": "MERGED",
  "mergeable": "UNKNOWN",
  "mergeStateStatus": "UNKNOWN",
  "reviewDecision": "APPROVED",
  "headRefOid": "def5678",
  "commits": [ { "committedDate": "2026-08-30T08:00:00Z" } ],
  "reviews": [],
  "statusCheckRollup": []
}
JSON

cat >"$FIXTURES/threads-1.json" <<'JSON'
{ "data": { "repository": { "pullRequest": { "reviewThreads": { "nodes": [
  { "id": "T_new", "isResolved": false, "comments": { "nodes": [
    { "author": { "login": "alice" }, "body": "rename this", "path": "src/a.ts", "line": 12,
      "url": "https://github.com/acme/widgets/pull/1#discussion_r2", "createdAt": "2026-09-03T11:00:00Z" } ] } },
  { "id": "T_old", "isResolved": true, "comments": { "nodes": [
    { "author": { "login": "alice" }, "body": "already handled", "path": "src/b.ts", "line": 3,
      "url": "https://github.com/acme/widgets/pull/1#discussion_r1", "createdAt": "2026-09-01T09:00:00Z" } ] } }
] } } } } }
JSON

cat >"$FIXTURES/threads-2.json" <<'JSON'
{ "data": { "repository": { "pullRequest": { "reviewThreads": { "nodes": [] } } } } }
JSON

cat >"$tmp/gh" <<'FAKE'
#!/usr/bin/env bash
if [[ "${1:-}" == pr && "${2:-}" == view ]]; then
  cat "$FIXTURES/pr${3}.json"
  exit 0
fi
if [[ "${1:-}" == api && "${2:-}" == graphql ]]; then
  n=""
  for a in "$@"; do
    case "$a" in number=*) n="${a#number=}" ;; esac
  done
  cat "$FIXTURES/threads-${n}.json"
  exit 0
fi
echo "fake gh: unhandled args: $*" >&2
exit 1
FAKE
chmod +x "$tmp/gh"

# A consumer repo: git root + .skilly/config.json naming one bot by login only.
repo="$tmp/repo"
mkdir -p "$repo/.skilly"
git -C "$repo" init -q
printf '{ "review": { "bots": ["renovate"] } }\n' >"$repo/.skilly/config.json"

export PATH="$tmp:$PATH"
run() { (cd "$repo" && bash "$here/pr-state.sh" "$@"); }

fails=0
check() { # check <name> <want> <got>
  if [[ "$2" == "$3" ]]; then
    echo "  ok   $1"
  else
    echo "  FAIL $1"
    echo "    want: $2"
    echo "    got:  $3"
    fails=$((fails + 1))
  fi
}

open_snapshot="$(run 1)"
since_snapshot="$(run 1 --since 2026-09-02T00:00:00Z)"
merged_snapshot="$(run 2)"

check "PENDING review dropped" \
  "alice renovate octobot[bot]" \
  "$(jq -r '[.reviews[].author] | join(" ")' <<<"$open_snapshot")"

check "isBot from config, from [bot] suffix, human otherwise" \
  "alice=false renovate=true octobot[bot]=true" \
  "$(jq -r '[.reviews[] | "\(.author)=\(.isBot)"] | join(" ")' <<<"$open_snapshot")"

check "threads unfiltered" "T_new T_old" \
  "$(jq -r '[.threads[].id] | join(" ")' <<<"$open_snapshot")"

check "--since drops the older thread" "T_new" \
  "$(jq -r '[.threads[].id] | join(" ")' <<<"$since_snapshot")"

check "--since keeps the newer reviews" "3" \
  "$(jq -r '.reviews | length' <<<"$since_snapshot")"

check "lastPushAt is the newest commit" "2026-09-02T10:00:00Z" \
  "$(jq -r '.lastPushAt' <<<"$open_snapshot")"

check "checks are shaped" "verify COMPLETED FAILURE" \
  "$(jq -r '.checks[0] | "\(.name) \(.status) \(.conclusion)"' <<<"$open_snapshot")"

check "PR author surfaced" "tim" "$(jq -r '.author' <<<"$open_snapshot")"

check "merged PR yields state MERGED" "MERGED" \
  "$(jq -r '.state' <<<"$merged_snapshot")"

check "merged PR has no threads" "0" \
  "$(jq -r '.threads | length' <<<"$merged_snapshot")"

if [[ $fails -eq 0 ]]; then
  echo "PASS pr-state.sh"
else
  echo "FAIL pr-state.sh ($fails)"
  exit 1
fi
