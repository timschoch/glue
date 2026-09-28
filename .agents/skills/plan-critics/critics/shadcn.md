---
name: shadcn
type: tech
activation: "shadcn shadcn-ui radix cmdk vaul ui/button ui/input ui/dialog ui/sheet ui/card ui/badge ui/table ui/ components.json"
---

# shadcn/ui Critic

## What to check

- **Reinventing existing components**: before building a custom modal, drawer, dropdown,
  table, or form control — is there already a shadcn/ui component that fits? Check
  the project's component registry (usually `components/ui/`)
- **Composition over override**: customising a shadcn component via `className` props and
  `cva` variants rather than rewriting the component from scratch
- **Accessibility props passed through**: shadcn components expose Radix accessibility props
  (`aria-label`, `aria-describedby`, etc.) — are they used where needed?
- **`asChild` prop**: used correctly? `asChild` renders as the child element — misuse breaks
  the DOM structure and accessibility
- **Theme customisation**: changes to `components.json` or CSS variable overrides — are they
  consistent with the project's design token system rather than shadcn defaults?
- **Dialog / Sheet focus trap**: custom content inside dialogs — is focus correctly managed?
  Are close buttons reachable via keyboard?

## Sources

- Context7: resolve `shadcn/ui` → query for component API, composition patterns, theming
