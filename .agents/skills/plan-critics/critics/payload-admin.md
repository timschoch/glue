---
name: payload-admin
type: tech
activation: "admin panel admin-component custom-view field-component collection-view global-view payload admin.components root-view"
standalone-skill: payload-admin-components
---

# Payload Admin Components Critic

## What to check

- **Server vs Client Component split**: Payload admin components default to Server Components.
  Adding `"use client"` is only correct when the component needs browser APIs, state, or event
  handlers — not just because it uses Payload hooks
- **Correct component slot**: using the right slot (Root / Collection / Global / Field)?
  Replacing the wrong slot causes subtle UI breaks
- **Admin-only imports**: admin components must not import heavy server-side modules that
  would break the browser bundle (e.g. direct DB access, `fs`, `crypto`)
- **Custom field UI**: custom field components receive `field` props from Payload — is the
  component typed correctly against `PayloadAdminComponentProps`?
- **Styling scope**: admin components that import global CSS or Tailwind outside the admin
  design system will conflict with Payload's own styles
- **Server Actions in admin**: admin components calling Server Actions — are they wrapped in
  correct boundaries?
- **`payload.config.ts` registration**: all custom components must be registered in
  `admin.components` in `payload.config.ts` — is this in the plan?

## Sources

- Standalone skill `payload-admin-components`: load its SKILL.md for full guidance on Server
  vs Client split, hook usage, and styling
