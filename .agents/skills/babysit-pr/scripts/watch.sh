#!/usr/bin/env bash
# Block until the PR's checks settle, then print a fresh pr-state.sh snapshot.
#
# Usage: watch.sh <pr-number|url>
#   BABYSIT_MAX_MINUTES caps the wait (default 60), so a stuck queue cannot
#   hold the loop forever.
#
# Exit code mirrors `gh pr checks`: 0 all passed, 8 still pending at the cap,
# anything else a failing check.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
pr="${1:-}"
if [[ -z "$pr" ]]; then
  echo "usage: watch.sh <pr-number|url>" >&2
  exit 2
fi

max="${BABYSIT_MAX_MINUTES:-60}"
deadline=$(( $(date +%s) + max * 60 ))
rc=0
err="$(mktemp)"
trap 'rm -f "$err"' EXIT

while true; do
  # Right after a push GitHub has not registered any check yet. gh then
  # exits 1 with "no checks reported" instead of waiting. That is pending.
  set +e
  gh pr checks "$pr" --watch --fail-fast 2> "$err"
  rc=$?
  set -e
  cat "$err" >&2
  if grep -q 'no checks reported' "$err"; then rc=8; fi
  # The other early shape: only a skipped job has registered, so nothing is
  # pending and gh returns 0. Settled means at least one pass or fail.
  if [[ $rc -eq 0 ]]; then
    settled="$(gh pr checks "$pr" --json bucket --jq '[.[] | select(.bucket == "pass" or .bucket == "fail")] | length' 2>/dev/null || echo 0)"
    [[ "$settled" == "0" ]] && rc=8
  fi
  # gh 2.98: 8 = still pending, 0 = all passed.
  [[ $rc -eq 8 ]] || break
  if [[ "$(date +%s)" -ge "$deadline" ]]; then
    echo "watch.sh: checks still pending after ${max}m" >&2
    break
  fi
  sleep "${BABYSIT_POLL_SECONDS:-30}"
done

bash "$here/pr-state.sh" "$pr"
exit "$rc"
