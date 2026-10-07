import { and, asc, eq, gt, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { html } from 'hono/html'

import { comments } from './schema.ts'
import type { SocialDatabase } from './schema.ts'

// Longest field values a comment may carry, in characters.
const MAX_HANDLE_LENGTH = 100
const MAX_AUTHOR_LENGTH = 100
const MAX_TEXT_LENGTH = 5000

const MAX_BODY_BYTES = 64 * 1024

// Most comments one read lists, and the default.
const MAX_LIMIT = 500

// The id of a comment. Another text is the id of no comment.
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/

type CommentInput = { handle: string; author: string; text: string }

type CommentQuery = {
  handle: string
  since: Date | null
  until: Date | null
  limit: number
}

export function createApp(options: {
  database: SocialDatabase
  readKey: string
}) {
  const { database, readKey } = options
  const app = new Hono({ strict: false })

  // Posting is public, like analytics capture: any page may post a comment.
  app.post(
    '/api/comments',
    cors(),
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (context) => context.json({ error: 'payload too large' }, 413),
    }),
    async (context) => {
      const input = parseCommentInput(
        await context.req.json().catch(() => null),
      )
      if (typeof input === 'string') return context.json({ error: input }, 400)
      const [comment] = await database
        .insert(comments)
        .values(input)
        .returning({ id: comments.id, createdAt: comments.createdAt })
      return context.json(
        { id: comment.id, created_at: comment.createdAt.toISOString() },
        201,
      )
    },
  )

  app.get('/api/comments', bearerAuth({ token: readKey }), async (context) => {
    const query = parseCommentQuery(context.req.query())
    if (typeof query === 'string') return context.json({ error: query }, 400)
    const { handle, since, until, limit } = query
    const inRange = and(
      eq(comments.handle, handle),
      since ? gt(comments.createdAt, since) : undefined,
      until ? lte(comments.createdAt, until) : undefined,
    )
    const order = [asc(comments.createdAt), asc(comments.id)]
    // The time of the comment at the limit. The page ends after all comments
    // of that time, so a reader that goes on after the last one misses none.
    const atLimit = (
      await database
        .select({ createdAt: comments.createdAt })
        .from(comments)
        .where(inRange)
        .orderBy(...order)
        .offset(limit - 1)
        .limit(1)
    ).at(0)
    const rows = await database
      .select()
      .from(comments)
      .where(
        and(
          inRange,
          atLimit ? lte(comments.createdAt, atLimit.createdAt) : undefined,
        ),
      )
      .orderBy(...order)
    return context.json({
      comments: rows.map((row) => ({
        id: row.id,
        author: row.author,
        text: row.text,
        created_at: row.createdAt.toISOString(),
      })),
    })
  })

  // The page of one comment for a person. Public, like the comment.
  app.get('/comments/:id', async (context) => {
    const id = context.req.param('id')
    if (!UUID.test(id)) return context.notFound()
    const rows = await database
      .select()
      .from(comments)
      .where(eq(comments.id, id))
    const comment = rows.at(0)
    if (!comment) return context.notFound()
    return context.html(
      html`<!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>${comment.author} about ${comment.handle}</title>
          </head>
          <body>
            <h1>${comment.author} about ${comment.handle}</h1>
            <p>${comment.text}</p>
            <p>${comment.createdAt.toISOString()}</p>
          </body>
        </html>`,
    )
  })

  return app
}

// Returns the comment, or the reason it is invalid.
function parseCommentInput(body: unknown): CommentInput | string {
  if (typeof body !== 'object' || body === null) return 'body must be JSON'
  const fields = body as Record<string, unknown>
  const limits = {
    handle: MAX_HANDLE_LENGTH,
    author: MAX_AUTHOR_LENGTH,
    text: MAX_TEXT_LENGTH,
  }
  const input: Record<string, string> = {}
  for (const [name, maxLength] of Object.entries(limits)) {
    const value = fields[name]
    if (typeof value !== 'string' || value.trim() === '') {
      return `${name} must be a non-empty string`
    }
    if (value.length > maxLength) {
      return `${name} must be at most ${maxLength} characters`
    }
    input[name] = value.trim()
  }
  return input as CommentInput
}

// Returns the query, or the reason it is invalid.
function parseCommentQuery(
  params: Record<string, string>,
): CommentQuery | string {
  const { handle, since, until, limit = String(MAX_LIMIT) } = params
  if (!handle) return 'handle is required'
  const dates = { since: parseDate(since), until: parseDate(until) }
  for (const [name, date] of Object.entries(dates)) {
    if (date === undefined) return `${name} must be an ISO date`
  }
  const limitNumber = Number(limit)
  if (
    !Number.isInteger(limitNumber) ||
    limitNumber < 1 ||
    limitNumber > MAX_LIMIT
  ) {
    return `limit must be a whole number from 1 to ${MAX_LIMIT}`
  }
  return {
    handle,
    since: dates.since ?? null,
    until: dates.until ?? null,
    limit: limitNumber,
  }
}

// null without a value, undefined when the value is no date.
function parseDate(value: string | undefined): Date | null | undefined {
  if (value === undefined) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}
