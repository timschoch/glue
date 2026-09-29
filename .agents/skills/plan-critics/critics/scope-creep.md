---
name: scope-creep
type: universal
activation: "always"
---

# Scope Creep Critic

Checks whether the plan stays focused on what was actually asked.

## What to check

- **Core task identification**: summarise in one sentence what the user/ticket requested.
  Does each step in the plan directly serve that goal?
- **Unbounded additions**: does the plan include new features, new config options, new UI
  elements, or new APIs that were not requested?
- **Refactoring creep**: does the plan rename, reorganise, or "clean up" code beyond what is
  needed to implement the task? (Refactoring in passing is a risk — it expands diff, adds
  review burden, and can introduce regressions)
- **Infrastructure additions**: new tables, new collections, new services, new dependencies
  that serve speculative future needs rather than the current requirement
- **Documentation and test scope**: are new docs or tests proposed for areas unrelated to
  the change?
- **Bundled unrelated fixes**: does the plan "also fix" something it noticed while working
  on the core task? Flag as separate PR candidate.
- **Boundary check**: for each non-trivial item in the plan, ask "would removing this break
  the stated requirement?" If no — flag it as potential scope creep.
