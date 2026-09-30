import type { PgDatabase } from 'drizzle-orm/pg-core'
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// One public comment about a Product, found by the Product's handle.
// Millisecond precision: a reader passes `created_at` back as `since`, and a
// JavaScript date holds no microseconds.
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    handle: text('handle').notNull(),
    author: text('author').notNull(),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [index().on(table.handle, table.createdAt)],
)

export type SocialDatabase = PgDatabase<any, { comments: typeof comments }>
