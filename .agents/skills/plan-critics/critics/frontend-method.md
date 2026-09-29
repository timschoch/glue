---
name: frontend-method
type: tech
activation: "frontend component-architecture feature-folder page-design UI-implementation colocation colocate file-structure"
standalone-skill: laica-frontend-dev
---

# Frontend Methodology Critic

Checks whether the plan follows the project's established frontend engineering methodology
(file structure, component organisation, colocating logic with views, etc.).

## What to check

- **File structure**: does the plan place new files where the methodology expects them?
  (e.g. feature-collocated vs global `components/`, page-level vs shared layouts)
- **Component granularity**: is the component breakdown appropriate? One large component
  doing too much vs dozens of tiny ones adding indirection for no benefit
- **Colocation**: are styles, types, tests, and utilities placed next to the code that uses
  them (colocated), or scattered in global folders?
- **Consistency with existing pages**: does the plan follow the same architectural pattern
  as the existing pages in the app? (e.g. same data fetching strategy, same layout nesting)
- **Naming conventions**: file and component names — do they match the project's established
  convention (PascalCase components, kebab-case files, etc.)?

## Sources

- Standalone skill `laica-frontend-dev`: load its SKILL.md for the full frontend engineering
  methodology applicable to this project
