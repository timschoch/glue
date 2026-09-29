# First principles

Good defaults, not law — the developer's word overrides anything here.

1. Decide by this order. A higher item wins over a lower one.
   1. Best UX: simple and consistent across the whole app. Apply YAGNI.
   2. Security and runtime speed with the least code. Code is cost, not value. If removing code reaches the goal, remove. Keep code simple, consistent and vanilla.
   3. Saving dev time is never a priority.
2. Reason from what the problem needs, not from what the codebase already has. Do it right, no hacks or shortcuts. We'd rather refactor than carry technical debt and smelly code.
3. Fighting the framework or API is a smell. Wrappers around wrappers, type casts to silence errors, copied internals, config to undo defaults: stop. Read the docs for the intended path, focus on the desired outcome holistically, look at the whole problem instead of the local one, then take the path the framework was built for.
