# The ways to hurt yourself

Good defaults, not law — the developer's word overrides anything here.
Ask the user to run /audit-agent-history every couple weeks or when you had a session with a lot of troubles to find more items for this list.

1. Never run `gh auth switch`. It is global state; concurrent agent sessions race each other into the wrong account. The account is pinned per repo via the username in the origin URL.
2. Never delete-then-write, or temp-file plus `mv`, over an existing file. Those carry no proof of the state they overwrite, so they silently clobber another agent's concurrent edit.
3. Never work around a skilly-installed skill, hook, or rule in silence. A bug you patch locally stays live in every other consumer. Before you apply the workaround, file it: `gh issue create --repo timschoch/skilly` with the skill name, the command or event that hit it, expected vs actual, and the workaround.
