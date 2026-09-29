#!/usr/bin/env bash
# Fixture test for classify-failure.sh. Stubs `gh` on PATH and asserts the
# verdict follows the log, not the caller. Run: bash classify-failure.test.sh
#
# Runs (id -> log -> expected verdict):
#   111  ECONNRESET during npm fetch          -> flaky
#   222  TypeScript error in a changed file   -> real
#   333  "The hosted runner lost communication" -> flaky (marker mid-line)
#   444  empty log                            -> exit 1, nothing classified
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cat >"$tmp/gh" <<'FAKE'
#!/usr/bin/env bash
if [[ "${1:-}" == run && "${2:-}" == view ]]; then
  case "${3:-}" in
    111) printf 'npm ERR! network request to https://registry.npmjs.org failed\nnpm ERR! network ECONNRESET\n' ;;
    222) printf 'src/a.ts(3,5): error TS2345: Argument of type string is not assignable\nTest suite failed to run\n' ;;
    333) printf 'The hosted runner: GitHub Actions 7 lost communication with the server.\n' ;;
    444) printf '' ;;
    *)   echo "fake gh: unknown run ${3:-}" >&2; exit 1 ;;
  esac
  exit 0
fi
echo "fake gh: unhandled args: $*" >&2
exit 1
FAKE
chmod +x "$tmp/gh"
export PATH="$tmp:$PATH"

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

verdict() { bash "$here/classify-failure.sh" "$1" | head -n1; }

check "network reset reads flaky" "flaky" "$(verdict 111)"
check "type error reads real" "real" "$(verdict 222)"
check "hosted runner reads flaky" "flaky" "$(verdict 333)"

check "run id read out of a check URL" "flaky" \
  "$(verdict https://github.com/acme/widgets/actions/runs/111/job/9)"

check "evidence follows the verdict" "npm ERR! network ECONNRESET" \
  "$(bash "$here/classify-failure.sh" 111 | sed -n 3p)"

rc=0
bash "$here/classify-failure.sh" 444 >/dev/null 2>&1 || rc=$?
check "empty log classifies nothing" "1" "$rc"

rc=0
bash "$here/classify-failure.sh" "https://example.com/no-run-here" >/dev/null 2>&1 || rc=$?
check "URL without a run id is a usage error" "2" "$rc"

if [[ $fails -eq 0 ]]; then
  echo "PASS classify-failure.sh"
else
  echo "FAIL classify-failure.sh ($fails)"
  exit 1
fi
