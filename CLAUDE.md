# Glue

Concept hub: why an app is built the way it is. See [README.md](README.md).

## Commands

- `pnpm dev`: dev server, http://localhost:3000
- `pnpm typecheck`, `pnpm lint`, `pnpm check` (Prettier), `pnpm build`
- `node .agents/skills/verify/scripts/verify.mjs <commit|push|ci>`: the gate hooks and CI run. Add checks to [.skilly/verify.json](.skilly/verify.json), never to a hook.

## Rules

- UI: Mantine + CSS Modules. No Tailwind.
- Branches `<type>/<description>`, conventional commits. Never push to `main`; open a PR.
- Never edit `.agents/skills/`: skilly syncs it. Change the hub, https://github.com/timschoch/skilly.

## Which skill, in which order

- Feature: `grilling`, `to-spec`, `to-tickets`, `implement`, `verify`, `make-pr-easy-to-review`
- Bug: `diagnosing-bugs`, then `tdd`
- Issues and labels: `triage`, `wayfinder`

## Docs

- Domain language: [CONTEXT.md](CONTEXT.md)
