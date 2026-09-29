---
name: design-system
type: tech
activation: "tailwind className dark-mode theme design-token color spacing typography font border radius shadow tw- @theme css-variable design-system component-style"
standalone-skill:
  - laica-design-audit
  - laica-design-tokens
  - laica-component-styling
---

# Design System Critic

## What to check

- **Design token usage**: are colors, spacing, typography, and border radii taken from the
  design system tokens (CSS variables, `@theme` values) rather than arbitrary values?
  Arbitrary Tailwind values like `text-[13px]` or `bg-[#4a3f8c]` are a code smell unless
  there is an explicit reason
- **Tailwind v4 patterns**: is `@theme inline` used correctly in `globals.css`? New utilities
  defined with `@utility`? No accidental Tailwind v3 config syntax (`tailwind.config.js`
  extend blocks) mixed in
- **Dark mode consistency**: new components — do they handle dark mode via the established
  pattern in the codebase?
- **Spacing scale**: margins, paddings, gaps — are they on the defined spacing scale or
  arbitrary?
- **Component reuse**: before creating a new styled component, is there an existing one in
  `src/components/` or `src/app/shadcn/` that could be used or extended?
- **Responsive behaviour**: new UI — does the plan address mobile/tablet breakpoints, or is
  it desktop-only?
- **Accessibility**: colour contrast (does the design token ensure AA contrast?), focus
  states, ARIA roles on custom interactive elements

## Sources

- Standalone skill `laica-design-audit`: load its SKILL.md for Laica design system compliance
  checklist
- Standalone skill `laica-design-tokens`: load its SKILL.md to look up available tokens
- Standalone skill `laica-component-styling`: load its SKILL.md for styling workflow
