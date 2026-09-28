---
name: codebase
type: universal
activation: "always"
---

# Codebase Critic

Searches the repository to find existing code that the plan overlooks or duplicates.

## What to check

- **Duplicate utilities**: does the plan propose a new function, hook, or helper that already
  exists somewhere in this repo? (date formatting, string manipulation, API clients, etc.)
- **Duplicate components**: does the plan introduce a UI component similar to one that already
  exists? Check for visual and functional overlap.
- **Conflicting libraries**: does the plan add a package that duplicates one already in
  `package.json`? (e.g. two date libraries, two HTTP clients, two form libraries)
- **Existing patterns not followed**: does the plan invent a new pattern for something the
  codebase already does consistently? (error handling, data fetching, state management, events etc.)
- **Dead code risk**: does the plan deprecate or replace something without removing the old
  version?
- **Import path collisions**: new files at paths that may conflict with existing ones

## Codebase searches

Run these using the **Grep** and **Glob** tools (not Bash). Adjust paths based on what exists
in the project. Common starting points: `src/`, `lib/`, `app/`, `components/`, `utils/`.

1. Search for existing utilities similar to what the plan proposes:
   - Grep for function names mentioned in the plan
   - Grep for the data type or concept being implemented

2. Check `package.json` for duplicate library purposes:
   - Read `package.json` → scan `dependencies` and `devDependencies`
   - Look for packages with overlapping purposes to any new package the plan adds

3. Search for similar components (frontend plans):
   - Glob `src/**/*.tsx` or `src/**/*.jsx` — skim component names
   - Grep for prop types or API patterns that match what the plan describes

4. Check for existing patterns:
   - If plan introduces a new data-fetching approach: grep for existing fetch patterns
   - If plan introduces a new error boundary: grep for existing error handling

Report specific file paths for every match found.
