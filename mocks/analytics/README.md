# mock-analytics

A Mock of PostHog (see [CONTEXT.md](../../CONTEXT.md)). Products send events with `posthog-js` or `posthog-node`, `api_host` pointed here. Glue reads funnels, means and values over HTTP. Decisions D13, D21.

Must not import from Glue's `src/`, and `src/` must not import from it.

## API

Capture, no auth, CORS open:

- `POST /e/`, `/i/v0/e/`, `/batch/`, `/capture/`: single event, array, or `{ batch }`. Bodies: JSON, gzip found by its magic bytes (posthog-js sends it as `text/plain` with no marker), `compression=base64` form (`data=`). 5 MB on the wire, 20 MB after gzip, else 413. Project key from `api_key`, `token` or `properties.token`.
- `/decide/`, `/flags/`: no flags. `/array/<token>/config` and `config.js`: `{}`.

Persons, like PostHog: an `$identify` event (posthog-js `identify()`) merges the anonymous id in `$anon_distinct_id` into its `distinct_id`. A funnel counts both ids as one person, for events before and after the identify, and for an identify outside `from` and `to`. Mean and values count events, not persons. Real PostHog never merges two already-identified persons this way. This mock does not track that distinction, so it merges a whole chain of identifies.

Query, `Authorization: Bearer $MOCK_ANALYTICS_READ_KEY`:

- `POST /api/funnel` with `{ project, steps, from, to, breakdown?, window_hours? }`. Returns `{ results: [{ breakdown, steps: [{ event, count, conversion_from_previous, conversion_from_first }] }] }`. A person counts once, at the deepest step reached in order within `window_hours` (default 336, PostHog's 14 days) of their first step. `breakdown` reads that first step's property.
- `POST /api/mean` with `{ project, event, property, from, to, where?, breakdown? }`. Returns `{ results: [{ breakdown, count, mean, lastSeenAt }] }`, like HogQL `avg()` and `max(timestamp)`. `where` is `{ property, value }`: only events whose property equals the value. A number string counts as its number, any other value that is not a number is skipped. `count` is the number of values read, `mean` is `null` when it is 0. `lastSeenAt` is the time of the newest event read, `null` when `count` is 0. `breakdown` reads each event's property. Most values first.
- `POST /api/values` with `{ project, event, property, from, to, where?, breakdown?, limit? }`. Returns `{ results: [{ breakdown, values: [{ value, count }] }] }`: each value as text with its event count, most frequent first. For free text like survey comments. Empty values are skipped. `limit` is per breakdown, default 100, 1 to 1000. `where` and `breakdown` as in `/api/mean`.
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
