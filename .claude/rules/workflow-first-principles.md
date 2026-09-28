# First principles

Good defaults, not law — the developer's word overrides anything here.

1. The goal is the best user experience and security with the least code. Code is cost, not value. If removing code reaches the goal, remove. Reason from what the problem needs, not from what the codebase already has. We'd rather refactor than carry technical debt and smelly code.
2. Fighting the framework or API is a smell. Wrappers around wrappers, type casts to silence errors, copied internals, config to undo defaults: stop. Read the docs for the intended path, focus on the desired outcome holistically, look at the whole problem instead of the local one, then take the path the framework was built for.
