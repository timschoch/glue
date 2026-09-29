#!/usr/bin/env bash
# Fixture test for stale-claims.sh. Stubs `gh` on PATH and asserts the planner
# prints exactly the stale claims — nothing else. Run: bash stale-claims.test.sh
#
# Scenarios (issue → expected):
#   101 stale one      old label, no linked PR                 → PRINTED
#   102 has ref pr     old label, open PR body says "#102"     → skip (ref link)
#   103 fresh claim    label newer than threshold              → skip (too fresh)
#   104 branch linked  old label, open PR head == claim branch → skip (branch link)
#   105 early branch   old label, claim branch matches an      → skip (branch link)
#                      EARLY line of a LARGE PR list — the
#                      regression guard for the `cut | grep -q`
#                      SIGPIPE-under-pipefail bug: a small or
#                      last-line match does not exercise it.
#    10 boundary       old label, no link; #102/#104/#105 must → PRINTED
#                      not false-match #10 (word-boundary check)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cat >"$tmp/gh" <<'FAKE'
#!/usr/bin/env bash
cmd="${1:-}"; sub="${2:-}"
if [[ "$cmd" == pr && "$sub" == list ]]; then
  pad="$(printf 'x%.0s' {1..300})"                 # fat rows so the list far
  printf '600\tfeature/early-105\t%s\n' "$pad"     # exceeds the pipe buffer and
  for i in $(seq 1 2000); do                       # the match sits on row 1 —
    printf '%d\tfiller/br-%d\t%s\n' "$((700+i))" "$i" "$pad"   # forces SIGPIPE
  done                                             # on the buggy `cut | grep -q`
  printf '500\tfeature/fix-x\tsome title closes #102 here\n'
  printf '501\tfeature/x-104\tunrelated pr body\n'
  exit 0
fi
if [[ "$cmd" == issue && "$sub" == list ]]; then
  printf '101\tstale one\n'
  printf '102\thas ref pr\n'
  printf '103\tfresh claim\n'
  printf '104\tbranch linked\n'
  printf '105\tearly branch match\n'
  printf '10\tboundary\n'
  exit 0
fi
if [[ "$cmd" == api ]]; then
  n="$(printf '%s' "$2" | sed -E 's#.*/issues/([0-9]+)/timeline#\1#')"
  case "$n" in
    103) echo "2099-01-01T00:00:00Z" ;;   # fresh (future) → not stale
    *)   echo "2000-01-01T00:00:00Z" ;;   # ancient → past any threshold
  esac
  exit 0
fi
if [[ "$cmd" == issue && "$sub" == view ]]; then
  case "$3" in
    101) echo "🤖 in-progress — feature/a-101 (s1) 2000-01-01" ;;
    104) echo "🤖 in-progress — feature/x-104 (s2) 2000-01-01" ;;
    105) echo "🤖 in-progress — feature/early-105 (s4) 2000-01-01" ;;
    10)  echo "🤖 in-progress — feature/b-10 (s3) 2000-01-01" ;;
  esac
  exit 0
fi
echo "fake gh: unhandled args: $*" >&2
exit 1
FAKE
chmod +x "$tmp/gh"

got="$(PATH="$tmp:$PATH" bash "$here/stale-claims.sh")"
want="$(printf '#101\tstale one\n#10\tboundary')"

if [[ "$got" == "$want" ]]; then
  echo "PASS stale-claims.sh"
else
  echo "FAIL stale-claims.sh"
  echo "--- want ---"; printf '%s\n' "$want"
  echo "--- got  ---"; printf '%s\n' "$got"
  exit 1
fi
