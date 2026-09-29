# Commits, PRs, issues

The reader of a commit message is bisecting a bug in two years. They have the diff. They do not have you, the ticket, or the chat. The plain rules apply on top.

- 701 Conventional Commits: `<type>(<scope>)?: <description>`, subject imperative ("add", not "added"/"adds").
- 702 The body answers **why**. The diff already answers what. No ticket number instead of a reason; `Resolves #625` on its own line is fine.
- 703 PR bodies: what changed, why, how you proved it works — readable without the diff open. Link the ticket; never let the link carry the explanation.
- 704 Refer to issues and maps by title, never by a bare number. A wall of `#42, #43, #44` is unreadable.

Good: `fix(planning): keep placements when a block loses its end time` + a body naming the cause and the fix. Bad: `fix: fix the thing we discussed`.
