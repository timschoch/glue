---
name: simplicity
type: universal
activation: "always"
---

# Simplicity Critic

Evaluates whether the plan is as simple as it needs to be — no more.

## What to check

- **DRY**: does the plan introduce logic or data that already exists elsewhere? Would the
  implementation duplicate an existing utility, hook, component, or config?
- **KISS**: is the proposed design more complex than the problem warrants? Could the same
  outcome be achieved with fewer abstractions, fewer files, fewer moving parts?
- **YAGNI**: does the plan build for hypothetical future requirements that were not asked
  for? Infrastructure for scale that doesn't exist yet? Config knobs that won't be used?
- **Single Source of Truth**: does the plan introduce multiple representations of the same
  state or data that must be kept in sync? Would two places own the same truth?
- **Unnecessary abstractions**: factory functions, wrapper classes, generic utilities for a
  single use case — things that add indirection without reuse
- **Premature generalisation**: "we might want to support X later" driving design decisions
  today, adding complexity that may never pay off
- **Over-engineering the happy path**: elaborate error recovery or fallback mechanisms for
  scenarios that cannot realistically occur in this codebase
- **Naming and scope**: does the plan propose a large function/module doing multiple things
  that should be split, or a tiny one that should be inlined?
