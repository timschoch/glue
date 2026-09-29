# Glue

The concept hub for any product: an app, a website, a service. It records WHY a product is built the way it is — one structured source of truth for product ownership, UX research, architecture and guardrails.

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

## Deploy

- Every PR and every push to `main` gets a Vercel preview.
- Production follows the `release` branch. Merge the release-please PR: the release workflow moves `release` forward and Vercel deploys it.
- Database: Neon (via the Vercel Marketplace). `DATABASE_URL` is set on Vercel for all environments. Run `vercel env pull .env.local` to get it locally.
