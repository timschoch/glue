#!/usr/bin/env bash
# Fixture test for watch.sh. Stubs `gh` on PATH with a call counter, so the
# first `pr checks --watch` behaves like gh right after a push ("no checks
# reported", exit 1) and the second like a settled run. Run: bash watch.test.sh
#
# Scenarios:
#   no checks yet  -> watch.sh keeps polling instead of returning an empty snapshot
#   skipped only   -> gh exits 0 with nothing pending; still polling until a pass or fail
#   all passed     -> exit 0 and a snapshot with the checks
#   red check      -> exit code of gh (1), snapshot still printed
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

export FIXTURES="$tmp/fixtures"
export CALLS="$tmp/calls"
mkdir -p "$FIXTURES"
: >"$CALLS"

cat >"$FIXTURES/pr7.json" <<'JSON'
{
  "number": 7,
  "url": "https://github.com/acme/widgets/pull/7",
  "author": { "login": "tim" },
  "state": "OPEN",
  "mergeable": "MERGEABLE",
  "mergeStateStatus": "CLEAN",
  "reviewDecision": "",
  "headRefOid": "abc1234",
  "commits": [ { "committedDate": "2026-09-02T10:00:00Z" } ],
  "reviews": [],
  "statusCheckRollup": [
    { "name": "verify", "status": "COMPLETED", "conclusion": "SUCCESS",
      "detailsUrl": "https://github.com/acme/widgets/actions/runs/555/job/9" }
  ]
}
JSON

cat >"$FIXTURES/threads-7.json" <<'JSON'
{ "data": { "repository": { "pullRequest": { "reviewThreads": { "nodes": [] } } } } }
JSON

# WATCH_PLAN: one exit code per `pr checks --watch` call, in order.
cat >"$tmp/gh" <<'FAKE'
#!/usr/bin/env bash
if [[ "${1:-}" == pr && "${2:-}" == checks && "${3:-}" == 7 && "${4:-}" == --json ]]; then
  # SKIPPED_ONLY: the first settled-count call sees only a skipped job.
  if [[ -f "$SKIPPED_ONLY" ]]; then rm -f "$SKIPPED_ONLY"; echo 0; else echo 1; fi
  exit 0
fi
if [[ "${1:-}" == pr && "${2:-}" == checks ]]; then
  echo x >>"$CALLS"
  n="$(wc -l <"$CALLS" | tr -d ' ')"
  rc="$(echo "$WATCH_PLAN" | cut -d, -f"$n")"
  if [[ "$rc" == none ]]; then
    echo "no checks reported on the 'feature' branch" >&2
    exit 1
  fi
  echo "verify	pass	10s	https://github.com/acme/widgets/actions/runs/555/job/9"
  exit "$rc"
fi
if [[ "${1:-}" == pr && "${2:-}" == view ]]; then
  cat "$FIXTURES/pr${3}.json"
  exit 0
fi
if [[ "${1:-}" == api && "${2:-}" == graphql ]]; then
  cat "$FIXTURES/threads-7.json"
  exit 0
fi
echo "fake gh: unhandled args: $*" >&2
exit 1
FAKE
chmod +x "$tmp/gh"

repo="$tmp/repo"
mkdir -p "$repo"
git -C "$repo" init -q

export PATH="$tmp:$PATH"
export SKIPPED_ONLY="$tmp/skipped-only"
export BABYSIT_POLL_SECONDS=0
export BABYSIT_MAX_MINUTES=1

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

run() { # run <plan> -> sets out, rc
  : >"$CALLS"
  rc=0
  out="$(cd "$repo" && WATCH_PLAN="$1" bash "$here/watch.sh" 7 2>/dev/null)" || rc=$?
  # gh's own check lines precede the snapshot on stdout; the JSON starts at the first brace.
  out="$(echo "$out" | sed -n '/^{/,$p')"
}

run "none,0"
check "no checks yet: polls again" "2" "$(wc -l <"$CALLS" | tr -d ' ')"
check "no checks yet: exit 0 once green" "0" "$rc"
check "no checks yet: snapshot carries the check" "verify" "$(echo "$out" | jq -r '.checks[0].name')"

run "0"
check "green: one call" "1" "$(wc -l <"$CALLS" | tr -d ' ')"
check "green: exit 0" "0" "$rc"

touch "$SKIPPED_ONLY"
run "0,0"
check "only a skipped job yet: polls again" "2" "$(wc -l <"$CALLS" | tr -d ' ')"
check "only a skipped job yet: exit 0 once settled" "0" "$rc"

run "1"
check "red: exit mirrors gh" "1" "$rc"
check "red: snapshot still printed" "7" "$(echo "$out" | jq -r '.number')"

if [[ $fails -eq 0 ]]; then
  echo "PASS watch.sh"
else
  echo "FAIL watch.sh ($fails)"
  exit 1
fi
