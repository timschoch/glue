---
name: edge-cases
type: universal
activation: "always"
---

# Edge Cases Critic

Identifies scenarios the plan does not explicitly handle.

## What to check

- **Null / undefined / empty**: what happens when a list is empty, a string is blank, a
  nullable field is null, a prop is not passed?
- **Boundary values**: very large inputs, very small inputs, zero, negative numbers, dates
  at epoch or far future, strings at max length
- **Concurrent access**: if two users or processes hit the same resource simultaneously, can
  there be a race condition, double-write, or dirty read?
- **Network and async failures**: what happens when an API call fails, times out, or returns
  an unexpected status code? Are retries safe (idempotent)?
- **Partial failures**: in multi-step flows (e.g. write to DB then send email), what happens
  if step N succeeds but step N+1 fails? Is the state left consistent?
- **Permissions and roles**: does the plan handle users with insufficient permissions
  gracefully? Is every access path gated?
- **Timezone and locale**: date/time operations — are they timezone-aware? Currency and
  number formatting — locale-dependent?
- **Browser / device edge cases** (frontend plans): mobile viewport, keyboard navigation,
  screen readers, reduced motion, high-contrast mode
- **Missing error states in UI**: loading, empty state, and error state — does the plan
  cover all three for every async operation?
- **Data migration edge cases**: existing rows that don't match new constraints; null values
  in columns being made non-nullable
