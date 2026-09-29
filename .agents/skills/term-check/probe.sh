#!/usr/bin/env bash
# Term comprehension probe. Does the word carry the meaning without the docs?
#
#   bash probe.sh <scenario-file> <term> [term ...]
#
# The scenario file holds {TERM} where the candidate word goes. Every run starts
# from an empty conversation in a neutral directory, so no repo doc reaches the
# model. See SKILL.md for what the global CLAUDE.md still contributes.
set -uo pipefail

[ $# -ge 2 ] || { echo "usage: bash probe.sh <scenario-file> <term> [term ...]"; exit 2; }
SCENARIO="$1"; shift
[ -f "$SCENARIO" ] || { echo "no scenario file: $SCENARIO"; exit 2; }

MODELS="opus sonnet fable"
RUNS="1 2"
OUT=$(mktemp -d)
NEUTRAL=$(mktemp -d)

for term in "$@"; do
  for model in $MODELS; do
    for run in $RUNS; do
      (
        text=$(sed "s|{TERM}|$term|g" "$SCENARIO")
        cd "$NEUTRAL" || exit 1
        claude -p --model "$model" --effort low --strict-mcp-config "$text" \
          > "$OUT/$term.$model.$run" 2>&1
      ) &
    done
  done
done
wait

for term in "$@"; do
  printf '\n=== %s ===\n' "$term"
  for model in $MODELS; do
    for run in $RUNS; do
      printf '\n-- %s run %s --\n' "$model" "$run"
      cat "$OUT/$term.$model.$run"
    done
  done
done
printf '\nraw: %s\n' "$OUT"
