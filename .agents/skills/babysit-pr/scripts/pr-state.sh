#!/usr/bin/env bash
# One JSON snapshot of a PR: mergeability, checks, published reviews, review
# threads, and the head commit's timestamp. Read-only, mutates nothing.
#
# Usage: pr-state.sh <pr-number|url> [--since <iso-8601>]
#   --since drops reviews and threads created at or before that timestamp.
#           Feed it the previous snapshot's `lastPushAt`.
#
# PENDING reviews never appear: a reviewer still drafting has not spoken yet.
# Bot logins come from `.skilly/config.json` -> .review.bots at the git root
# (missing file or key = none); a login ending in `[bot]` also counts.
set -euo pipefail
export LC_ALL=C   # ISO-8601 strings compare lexicographically == chronologically

pr="${1:-}"
if [[ -z "$pr" ]]; then
  echo "usage: pr-state.sh <pr-number|url> [--since <iso-8601>]" >&2
  exit 2
fi
shift

since=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --since) since="${2:-}"; shift 2 ;;
    *) echo "pr-state.sh: unknown argument: $1" >&2; exit 2 ;;
  esac
done

bots='[]'
root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -n "$root" && -f "$root/.skilly/config.json" ]]; then
  bots="$(jq -c '[.review.bots[]? | ascii_downcase]' "$root/.skilly/config.json")"
fi

# `author` and `url` are beyond the snapshot's own shape: `author` decides who
# counts as a human reviewer, `url` carries owner/repo for the GraphQL call.
view="$(gh pr view "$pr" --json \
  number,url,author,state,mergeable,mergeStateStatus,reviewDecision,headRefOid,commits,reviews,statusCheckRollup)"

url="$(jq -r '.url' <<<"$view")"
owner="$(cut -d/ -f4 <<<"$url")"
name="$(cut -d/ -f5 <<<"$url")"
number="$(jq -r '.number' <<<"$view")"

# Review threads carry resolution state, which `gh pr view` does not expose.
threads="$(gh api graphql -F owner="$owner" -F name="$name" -F number="$number" -f query='
  query($owner:String!, $name:String!, $number:Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            comments(first: 1) {
              nodes { author { login } body path line url createdAt }
            }
          }
        }
      }
    }
  }')"

jq -n --argjson view "$view" --argjson threads "$threads" \
      --argjson bots "$bots" --arg since "$since" '
  def isbot($login):
    ($login | ascii_downcase) as $l
    | ($bots | index($l)) != null or ($l | endswith("[bot]"));
  def fresh($at):
    $since == "" or ($at != null and $at > $since);

  {
    number:           $view.number,
    author:           ($view.author.login // ""),
    state:            ($view.state // ""),
    mergeable:        ($view.mergeable // ""),
    mergeStateStatus: ($view.mergeStateStatus // ""),
    reviewDecision:   ($view.reviewDecision // ""),

    checks: [ $view.statusCheckRollup[]? | {
      name:       (.name // .context // ""),
      status:     (.status // .state // ""),
      conclusion: (.conclusion // .state // ""),
      url:        (.detailsUrl // .targetUrl // "")
    } ],

    reviews: [ $view.reviews[]?
      | select((.state // "" | ascii_upcase) != "PENDING")
      | select(fresh(.submittedAt))
      | ((.author.login) // "") as $login
      | { author: $login, state: (.state // ""), submittedAt: (.submittedAt // null), isBot: isbot($login) } ],

    threads: [ $threads.data.repository.pullRequest.reviewThreads.nodes[]?
      | . as $t | (($t.comments.nodes // [])[0] // {}) as $c
      | select(fresh($c.createdAt))
      | { id: $t.id, isResolved: $t.isResolved, path: ($c.path // null), line: ($c.line // null),
          author: ($c.author.login // ""), body: ($c.body // ""), url: ($c.url // ""),
          createdAt: ($c.createdAt // null) } ],

    lastPushAt: ([ $view.commits[]?.committedDate ] | sort | last)
  }'
