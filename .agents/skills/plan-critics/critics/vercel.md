---
name: vercel
type: tech
activation: "vercel deployment edge-function vercel.json cron-job vercel-blob build-config region function-size environment-variable vercel-cron"
---

# Vercel Critic

## What to check

- **Cron syntax**: `vercel.json` cron expressions — is the format correct? Vercel crons use
  standard POSIX cron syntax. Minimum interval is 1 minute (free tier: daily minimum)
- **Function region**: new API routes or Server Actions — is `export const runtime = 'edge'`
  intentional? Edge runtime has no Node.js built-ins (`fs`, `crypto` subset only)
- **Bundle size**: new dependencies added to routes that will be deployed as Vercel Functions
  — will they exceed the 50MB function bundle limit?
- **Environment variables**: new env vars — are they added to Vercel project settings for all
  environments (production, preview, development)? `NEXT_PUBLIC_` vars are baked into the
  build — wrong values require a redeploy
- **Vercel Blob usage**: new file upload flows — is Vercel Blob used correctly? Are uploads
  server-side (not exposing token to client)?
- **Build-gated branches**: if the project's `vercel.json` gates builds by branch, does the
  plan account for this when deploying to a new branch?
- **Headers and redirects**: new routes — are security headers (`X-Frame-Options`, `HSTS`)
  correctly applied via `vercel.json` headers config?

## Sources

- Context7: resolve `vercel` → query for cron, edge runtime, blob, deployment config
