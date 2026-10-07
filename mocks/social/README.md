# mock-social

A Mock of a social channel (see [CONTEXT.md](../../CONTEXT.md)). Anyone posts a public Comment about a Product under its social handle. Glue reads the Comments per handle and records their Sentiment as a draft Insight. Decision D22.

Must not import from Glue's `src/`, and `src/` must not import from it.

## API

Post, no auth, CORS open:

- `POST /api/comments` with `{ handle, author, text }`. Answers `201 { id, created_at }`. Each field a non-empty string: `handle` and `author` up to 100 characters, `text` up to 5000. Else 400.

Read, `Authorization: Bearer <MOCK_SOCIAL_READ_KEY>`:

- `GET /api/comments?handle&since&until&limit&order`: `{ comments: [{ id, author, text, created_at }] }`, oldest first.
  - `since` (ISO, optional): only Comments posted after it. Pass the last `created_at` you read to get only new ones.
  - `until` (ISO, optional): only Comments posted at or before it. `created_at` is the start of the write, so a Comment can show up a moment after its time: read up to some seconds before now.
  - `limit` (1 to 500, default 500): the oldest `limit` Comments, plus the others with the same `created_at` as the last one. So reading on after the last `created_at` misses none.
  - `order` (`oldest` or `newest`, default `oldest`): `newest` lists the newest `limit` Comments, newest first. The Signals list of Glue reads with it.

Page, no auth:

- `GET /comments/:id`: the Comment as a page for a person. Unknown id: 404. Glue links a Signal to this page.

## Env

| Name                       | Where                  | Value                                                            |
| -------------------------- | ---------------------- | ---------------------------------------------------------------- |
| `MOCK_SOCIAL_DATABASE_URL` | Vercel, local optional | Neon connection string of the mock's own database                |
| `MOCK_SOCIAL_READ_KEY`     | Vercel, local optional | Read key for `GET /api/comments`. Local default `local-read-key` |
| `MOCK_SOCIAL_URL`          | post                   | Target host. Default `http://localhost:4001`                     |

Glue reads the Mock with `MOCK_SOCIAL_URL` and `MOCK_SOCIAL_READ_KEY`, and labels Sentiment with `HF_TOKEN`. Without `MOCK_SOCIAL_URL` the measure run skips Comments.

## Local

```sh
pnpm --filter mock-social dev    # http://localhost:4001, in-memory PGlite without MOCK_SOCIAL_DATABASE_URL
pnpm --filter mock-social post --handle flexibeck --file comments.json   # [{ "author": "ada", "text": "..." }], in file order
pnpm --filter mock-social test
```

The `post` file path is relative to `mocks/social`, where pnpm runs the script. Use an absolute path from elsewhere.

## Deploy

Own Vercel project:

- Root directory: `mocks/social`
- Framework preset: Hono, pinned in `vercel.json`. Entry `src/index.ts`, same setup as [mock analytics](../analytics/README.md#deploy).
- Env: `MOCK_SOCIAL_DATABASE_URL`, `MOCK_SOCIAL_READ_KEY`

Migrations: `MOCK_SOCIAL_DATABASE_URL=… pnpm --filter mock-social db:migrate`. Schema change: edit `src/schema.ts`, run `db:generate`.
