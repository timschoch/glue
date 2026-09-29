---
name: nextjs
type: tech
activation: "route page layout app-router pages-router server-component client-component middleware server-action route-handler loading error next.config"
standalone-skill: vercel-react-best-practices
---

# Next.js Critic

## What to check

- **`use client` overuse**: components marked as Client Components when they have no
  interactivity, event handlers, or browser-only APIs — they should be Server Components
- **Data fetching pattern**: is `fetch` used directly in Server Components? Are Route Handlers
  used where Server Actions would be simpler? Are `getServerSideProps` patterns showing up in
  the App Router?
- **Cache and revalidation**: is `revalidate` set appropriately? Is `unstable_cache` used
  correctly? Are dynamic routes that should be static being force-rendered on every request?
- **Layout nesting**: is the data fetching at the right layout level? Is the same data fetched
  multiple times at different layout levels?
- **Metadata**: new pages — do they have `generateMetadata` or a `metadata` export?
- **Loading and error boundaries**: new routes — is there a `loading.tsx` and `error.tsx`?
- **Parallel and intercepting routes**: used appropriately, or added where simple conditionals
  would suffice?
- **Middleware scope**: is middleware running on routes where it's not needed (asset routes,
  API routes that handle their own auth)?
- **Environment variables**: `NEXT_PUBLIC_` prefix used correctly — no secrets in public vars

## Sources

- Standalone skill `vercel-react-best-practices`: load its SKILL.md for Next.js performance
  and architecture guidelines
- Context7: resolve `next.js` → query for App Router, Server Components, caching patterns
