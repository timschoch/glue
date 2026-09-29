---
name: vercel-cli
description: Operate Vercel with the CLI — pull env vars, inspect deployments, read runtime logs, list deploys. Use when a task needs Vercel deployment state, env vars, or logs. Not for writing app code.
---

# Vercel CLI

Vercel has a full CLI: `vercel`. Use it before reaching for the dashboard or the REST API.

- Pull env vars for local dev: `vercel env pull`
- Inspect a deployment: `vercel inspect <url>`
- Read runtime logs: `vercel logs <url>`
- List deployments: `vercel ls`
- Discover more: `vercel --help`

Deploys usually go through git/CI — do not `vercel deploy` production by hand unless the repo's workflow says so.
