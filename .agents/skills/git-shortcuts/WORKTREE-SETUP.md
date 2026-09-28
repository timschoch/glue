# Worktree teardown setup

`--close` stops when this is missing. It does not fall back to a bare `git worktree remove`: that
removes the directory but skips teardown, leaking whatever the worktree held — dev servers still
bound to their ports, a database branch that nothing will ever drop.

Hand the user this file, add the pieces below, and `--close` works in the repo.

The split is deliberate:

- `teardown.sh` — releases what the worktree *holds*, leaves the directory. Idempotent, always
  exits 0 (a non-zero teardown would block the removal it precedes).
- `worktree-remove.sh` — calls teardown, then removes the directory. Runs from the main checkout.
- `.superset/teardown.sh` — the same teardown, invoked by Superset when a session closes. This is
  why `--close` is a no-op inside a Superset worktree.

## 1. `package.json`

```json
{
  "scripts": {
    "wt:remove": "bash scripts/worktree-remove.sh"
  }
}
```

Non-Node repo → skip this; `--close` also accepts a bare `scripts/worktree-remove.sh` and calls it
with `bash`.

## 2. `scripts/teardown.sh`

```bash
#!/usr/bin/env bash
# Release everything this worktree holds: its dev servers and its database.
# Leaves the worktree itself in place — `yarn wt:remove` does that part.
#
# Always exits 0: a non-zero teardown blocks the removal it precedes.
set -uo pipefail

root="$(cd "${1:-$PWD}" && pwd -P)"

bash "$root/scripts/dev-stop.sh" "$root"          # stop dev servers — drop if the repo has none
(cd "$root" && yarn db:down) || echo "db:down failed — the branch expires on its own"

exit 0
```

Replace the two middle lines with whatever the repo actually holds. Every step must survive being
run twice and must not abort the script.

## 3. `scripts/worktree-remove.sh`

```bash
#!/usr/bin/env bash
# Drop this worktree's database, then remove the worktree itself.
#
# Usage: yarn wt:remove [path]   (default: the current worktree)
set -euo pipefail

DEST="$(cd "${1:-$PWD}" && pwd -P)"
MAIN="$(cd "$(dirname "$(git -C "$DEST" rev-parse --git-common-dir)")" && pwd -P)"

if [ "$DEST" = "$MAIN" ]; then
  echo "ERROR: $DEST is the main checkout, not a worktree" >&2
  exit 1
fi

bash "$DEST/scripts/teardown.sh" "$DEST"

git -C "$MAIN" worktree remove "$DEST"
echo "==> Removed $DEST"
```

The main-checkout guard matters: the script deletes the directory it is pointed at, and pointing it
at the main checkout would take the repo with it. `git worktree remove` refuses a worktree with
uncommitted changes — that refusal is a feature, never add `--force`.

## 4. Superset (optional)

Superset runs these when the AI session opens and closes, which is what makes `--close` unnecessary
inside a Superset worktree.

`.superset/config.json`:

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

`.superset/teardown.sh`:

```bash
#!/usr/bin/env bash
# Superset teardown — runs when the workspace is closed, before the PTYs are
# disposed, with a 60s budget.
set -uo pipefail

exec bash scripts/teardown.sh
```

Keep it a one-line delegation. Two teardown implementations drift, and the one that drifts is the
one nobody runs by hand.

`chmod +x` every script, and commit them.
