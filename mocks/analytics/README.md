# mock-analytics

A Mock of PostHog (see [CONTEXT.md](../../CONTEXT.md)). Products send events with `posthog-js` or `posthog-node`, `api_host` pointed here. Glue reads funnels over HTTP. Decision D13.

Must not import from Glue's `src/`, and `src/` must not import from it.

## API

Capture, no auth, CORS open:

- `POST /e/`, `/i/v0/e/`, `/batch/`, `/capture/`: single event, array, or `{ batch }`. Bodies: JSON, gzip found by its magic bytes (posthog-js sends it as `text/plain` with no marker), `compression=base64` form (`data=`). 5 MB on the wire, 20 MB after gzip, else 413. Project key from `api_key`, `token` or `properties.token`.
- `/decide/`, `/flags/`: no flags. `/array/<token>/config` and `config.js`: `{}`.

Query, `Authorization: Bearer $MOCK_ANALYTICS_READ_KEY`:

- `POST /api/funnel` with `{ project, steps, from, to, breakdown?, window_hours? }`. Returns `{ results: [{ breakdown, steps: [{ event, count, conversion_from_previous, conversion_from_first }] }] }`. A user counts once, at the deepest step reached in order within `window_hours` (default 336, PostHog's 14 days) of their first step. `breakdown` reads that first step's property.
- `GET /api/events?project&event&from&to`: `{ days: [{ date, count }] }`, UTC days.

## Env

| Name                          | Where                  | Value                                                 |
| ----------------------------- | ---------------------- | ----------------------------------------------------- |
| `MOCK_ANALYTICS_DATABASE_URL` | Vercel, local optional | Neon connection string of the mock's own database     |
| `MOCK_ANALYTICS_READ_KEY`     | Vercel, local optional | Read key for `/api/*`. Local default `local-read-key` |
| `MOCK_ANALYTICS_URL`          | seed                   | Target host. Default `http://localhost:4000`          |
| `MOCK_ANALYTICS_PROJECT_KEY`  | seed                   | Project key. Default `phc_demo`                       |

## Local

```sh
pnpm --filter mock-analytics dev    # http://localhost:4000, in-memory PGlite without MOCK_ANALYTICS_DATABASE_URL
pnpm --filter mock-analytics seed   # a few hundred events for a demo funnel
pnpm --filter mock-analytics test
```

## Deploy

Own Vercel project:

- Root directory: `mocks/analytics`
- Framework preset: Hono, pinned in `vercel.json` (auto-detect picks Vite from the dev dependencies). Entry `src/index.ts`: the preset needs its import from `hono` and the default export. `tsconfig.json` `rewriteRelativeImportExtensions` turns the `.ts` imports into `.js` in the build.
- Env: `MOCK_ANALYTICS_DATABASE_URL`, `MOCK_ANALYTICS_READ_KEY`

Migrations: `MOCK_ANALYTICS_DATABASE_URL=… pnpm --filter mock-analytics db:migrate`. Schema change: edit `src/schema.ts`, run `db:generate`.
