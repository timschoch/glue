# Glue

The concept hub for any app. It records WHY an app is built the way it is — one structured source of truth for product ownership, UX research, architecture and guardrails.

Humans and agents read and maintain it. It takes in real data and decisions, and syncs with other tools or holds the data itself. Built to become a SaaS.

## Stack

- TanStack Start, React, TypeScript
- Mantine (UI, plain CSS / CSS Modules — no Tailwind)
- Neon Postgres + Drizzle
- Better Auth
- PostHog
- Vercel

## Develop

```sh
pnpm install
pnpm dev      # http://localhost:3000
pnpm build
pnpm lint
pnpm check    # Prettier
```
