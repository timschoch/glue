---
name: react
type: tech
activation: "component jsx hook useState useEffect useCallback useMemo useRef useContext props render client-component"
standalone-skill:
  - vercel-composition-patterns
  - vercel-react-best-practices
---

# React Critic

## What to check

- **Unnecessary `useEffect`**: is `useEffect` used where a derived value, event handler, or
  server-side fetch would be cleaner? Common misuse: syncing state to props, fetching on mount
  when a Server Component or `use()` hook would suffice
- **Rules of hooks violations**: hooks called conditionally, inside loops, or in non-component
  functions
- **Prop drilling**: passing props 3+ levels deep when context or co-location would be cleaner
- **Missing `key` props**: lists rendered without stable keys; using array index as key in
  mutable lists
- **Premature memoisation**: `useMemo` / `useCallback` wrapping cheap computations or stable
  references that don't need it — adds complexity, no benefit
- **State that should be derived**: state variables that are always computed from other state
  (should be a `const`, not `useState`)
- **Stale closure risk**: `useEffect` or `useCallback` referencing variables that change but
  are not in the dependency array
- **Component responsibility**: a component doing data fetching + business logic + rendering
  — consider splitting

## Sources

- Standalone skill `vercel-composition-patterns`: load its SKILL.md for composition patterns,
  render props, compound components, React 19 APIs
- Standalone skill `vercel-react-best-practices`: performance optimization guidelines
