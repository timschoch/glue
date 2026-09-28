#!/usr/bin/env bash
# Classify a failing check from its own log, so the decision rests on evidence
# and not on a guess. Prints `flaky` or `real` on line 1, then the first 20
# failing log lines.
#
#   flaky -> infra or transient, rerun it, never patch the branch
#   real  -> the branch caused it, patch the branch
#
# Usage: classify-failure.sh <check-url|run-id>
#   A check URL is `checks[].url` from pr-state.sh; the run id is read out of
#   its /actions/runs/<id> segment.
set -euo pipefail
export LC_ALL=C

arg="${1:-}"
if [[ -z "$arg" ]]; then
  echo "usage: classify-failure.sh <check-url|run-id>" >&2
  exit 2
fi

if [[ "$arg" =~ ^[0-9]+$ ]]; then
  run_id="$arg"
else
  run_id="$(sed -n -E 's#.*/actions/runs/([0-9]+).*#\1#p' <<<"$arg")"
fi
if [[ -z "$run_id" ]]; then
  echo "classify-failure.sh: no run id in: $arg" >&2
  exit 2
fi

# --log-failed is workflow-run scoped and stays empty until the run completes.
log="$(gh run view "$run_id" --log-failed 2>/dev/null || true)"
if [[ -z "$log" ]]; then
  echo "classify-failure.sh: no failed-job log for run $run_id (run still in flight?)" >&2
  exit 1
fi

# Markers of infra, network and runner trouble. A hit means the branch is not
# the cause. Extend this list, never the caller's judgement.
markers='ECONNRESET|ETIMEDOUT|rate limit|Unable to connect|runner lost|The hosted runner|npm ERR! network|timed out'

if grep -q -i -E "$markers" <<<"$log"; then
  echo flaky
else
  echo real
fi

head -n 20 <<<"$log"
