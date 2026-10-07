# mock-market

A Mock of a market analysis tool (see [GLOSSARY.md](../../GLOSSARY.md)). It answers with a small fixed set of findings. Glue reads the findings as Signals. Decision glue/D66.

Must not import from Glue's `src/`. Glue's `src/` reads it over HTTP only. Exception: the test of the market adapter imports `createApp`, so the adapter and the Mock cannot drift apart.

## API

No auth, no database, no AI call. The findings live in [src/findings.ts](src/findings.ts).

- `GET /api/findings`: `{ findings: [{ id, url, title, summary, published_at }] }`. `url` is the page of the finding.
- `GET /findings/:id`: the finding as a page for a person. Unknown id: 404.

Glue reads the Mock at the address in the Project setting: `pnpm concept project set <slug> --market <url>`.

## Local

```sh
pnpm --filter mock-market dev    # http://localhost:4003
pnpm --filter mock-market test
```

## Deploy

Own Vercel project:

- Root directory: `mocks/market`
- Framework preset: Hono, pinned in `vercel.json`. Entry `src/index.ts`, same setup as [mock analytics](../analytics/README.md#deploy).
- Env: none
