# mock-support

A Mock of a help desk (see [GLOSSARY.md](../../GLOSSARY.md)). It answers the list call of the Zendesk Support API with seeded tickets. Glue reads the tickets as Signals. Decision glue/D49.

Must not import from Glue's `src/`. Glue's `src/` reads it over HTTP only. Exception: the test of the support adapter imports `createApp`, so the adapter and the Mock cannot drift apart.

## API

No auth, no database. The tickets live in [src/tickets.ts](src/tickets.ts).

- `GET /api/v2/tickets.json`: `{ tickets: [{ id, url, subject, description, status, created_at }], next_page: null, previous_page: null, count }`, like [Zendesk List Tickets](https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/#list-tickets). One page.
- `GET /agent/tickets/:id`: the ticket as a page for a person. Unknown id: 404.

Glue reads the Mock at the address in the Project setting: `pnpm concept project set <slug> --support <url>`.

## Local

```sh
pnpm --filter mock-support dev    # http://localhost:4002
pnpm --filter mock-support test
```

## Deploy

Own Vercel project:

- Root directory: `mocks/support`
- Framework preset: Hono, pinned in `vercel.json`. Entry `src/index.ts`, same setup as [mock analytics](../analytics/README.md#deploy).
- Env: none
