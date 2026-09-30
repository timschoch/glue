import type { PgDatabase } from 'drizzle-orm/pg-core'
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

// One captured event. `project` is the PostHog project API key the client sent.
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    project: text('project').notNull(),
    name: text('name').notNull(),
    distinctId: text('distinct_id').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    properties: jsonb('properties').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [index().on(table.project, table.name, table.timestamp)],
)

export type AnalyticsDatabase = PgDatabase<any, { events: typeof events }>
