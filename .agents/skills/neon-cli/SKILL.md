---
name: neon-cli
description: Run Neon operations with the neonctl CLI — list/create projects and branches, get connection strings. Use when a task needs a Neon project, branch, or connection string. Not for writing SQL or app code.
---

# Neon CLI

Neon has a first-class CLI: `neonctl`. Use it before writing API calls or clicking the console.

- List projects: `neonctl projects list`
- List branches: `neonctl branches list --project-id <id>`
- Create a branch: `neonctl branches create --project-id <id> --name <name>`
- Get a connection string: `neonctl connection-string <branch> --project-id <id>`
- Discover more: `neonctl --help`

Auth: `neonctl auth` once per machine, or `NEON_API_KEY` in env.
