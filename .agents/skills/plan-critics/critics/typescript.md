---
name: typescript
type: tech
activation: "type interface generic infer satisfies declare as-const type-assertion narrowing union intersection"
---

# TypeScript Critic

## What to check

- **`as` type assertions**: casting with `as SomeType` bypasses type checking — is the
  assertion justified? Could the type be properly inferred or narrowed instead?
- **`any` escape hatches**: `as any`, `// @ts-ignore`, `// @ts-expect-error` — are they
  documented with a reason? Are they avoidable?
- **Missing narrowing**: union types accessed without type guards — will this fail at runtime
  on one of the union members?
- **Overly wide types**: `string | number | boolean | undefined | null` when a narrower type
  would make the intent clear and the code safer
- **Generic constraints missing**: generic functions that accept `T` but only work with
  objects — should be `T extends object`
- **`satisfies` vs type annotation**: is `satisfies` used where it would give better
  inference than a type annotation?
- **Strict null checks**: is the code written assuming strict null checks are on (they are)?
  Are optional chaining and nullish coalescing used appropriately?
- **Return type annotations**: exported functions — are return types explicit for public API
  clarity?

## Sources

- Context7: resolve `typescript` → query for generics, narrowing, utility types
