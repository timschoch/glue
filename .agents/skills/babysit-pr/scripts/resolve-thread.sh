#!/usr/bin/env bash
# Mark one PR review thread resolved.
#
# Usage: resolve-thread.sh <threadId>
#   <threadId> is `threads[].id` from pr-state.sh, a GraphQL node ID.
#
# Resolve only a thread whose item was fixed and pushed. A human's thread stays
# open until the user says otherwise.
set -euo pipefail

id="${1:-}"
if [[ -z "$id" ]]; then
  echo "usage: resolve-thread.sh <threadId>" >&2
  exit 2
fi

gh api graphql -F id="$id" -f query='
  mutation($id: ID!) {
    resolveReviewThread(input: {threadId: $id}) {
      thread { id isResolved }
    }
  }' --jq '.data.resolveReviewThread.thread | "\(.id) isResolved=\(.isResolved)"'
