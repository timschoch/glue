import { and, asc, eq, gt } from 'drizzle-orm'
import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'

import { comments } from './schema.ts'
import type { SocialDatabase } from './schema.ts'

// Longest field values a comment may carry, in characters.
const MAX_HANDLE_LENGTH = 100
const MAX_AUTHOR_LENGTH = 100
const MAX_TEXT_LENGTH = 5000

const MAX_BODY_BYTES = 64 * 1024

type CommentInput = { handle: string; author: string; text: string }

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
    const handle = context.req.query('handle')
    const sinceText = context.req.query('since')
    const since = sinceText === undefined ? null : parseDate(sinceText)
    if (!handle || since === undefined) {
      return context.json(
        { error: 'handle is required, since must be an ISO date' },
        400,
      )
    }
    const rows = await database
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.handle, handle),
          since ? gt(comments.createdAt, since) : undefined,
        ),
      )
      .orderBy(asc(comments.createdAt), asc(comments.id))
    return context.json({
      comments: rows.map((row) => ({
        id: row.id,
        author: row.author,
        text: row.text,
        created_at: row.createdAt.toISOString(),
      })),
    })
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

// undefined when the text is no date.
function parseDate(value: string): Date | undefined {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}
