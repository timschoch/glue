// The webhook of a Project (glue/D72): the way in for an Integration that
// Glue reads no tool for. The tool posts its Signals to Glue with the secret
// of the Integration, and Glue stores them. The Signals show under the
// address of the Integration. This module names no tool.
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { hashWebhookSecret } from './integration-key.ts'
import { InvalidRecordError, WebhookSecretError } from './record-errors.ts'
import * as schema from './schema.ts'
import type { SignalSource } from './signals.ts'

const { integrations, projects, webhookSignals } = schema

const LAST_CHARACTERS = 4

// The most Signals of one post, and the most characters of their fields.
export const MAX_POSTED_SIGNALS = 100
const MAX_TITLE_LENGTH = 300
const MAX_TEXT_LENGTH = 10_000
const MAX_TOOL_LENGTH = 60

const postedSignalSchema = z.strictObject({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  text: z.string().max(MAX_TEXT_LENGTH).default('').meta({
    description: 'What the user said or did, in words',
  }),
  link: z.httpUrl().meta({
    description:
      'The address of the Signal in its tool. A second post of the same link stores nothing',
  }),
  time: z.iso.datetime({ offset: true }).optional().meta({
    description: 'When the Signal came in. Default: the time of the post',
  }),
  tool: z.string().trim().min(1).max(MAX_TOOL_LENGTH).meta({
    description: 'The name of the tool that the Signal comes from',
  }),
})

export const webhookPostSchema = z.strictObject({
  signals: z.array(postedSignalSchema).min(1).max(MAX_POSTED_SIGNALS),
})

export type WebhookPost = z.input<typeof webhookPostSchema>

// What a member and a tool do with the Integrations that post to Glue.
// The Integrations use these operations: integrations.ts.
export function createWebhookOperations({
  db,
  now,
  createSecret,
}: {
  db: ConceptDb
  now: () => Date
  createSecret: () => string
}) {
  return {
    // Makes the secret. Only this answer holds it: the row keeps its hash
    // and its last four characters.
    async add(place: {
      projectId: number
      responsibleMemberId: number | undefined
      tool: string
      address: string
    }) {
      const secret = createSecret()
      const [row] = await db
        .insert(integrations)
        .values({
          ...place,
          encryptedKey: hashWebhookSecret(secret),
          keyLastFour: secret.slice(-LAST_CHARACTERS),
          state: 'active',
        })
        .returning()
      return { row, secret }
    },

    // Stores the Signals of a post, and keeps the time and the count of
    // the post as the last read. A post with a secret of no Integration of
    // the Project throws a WebhookSecretError. Only a secret that Glue made
    // is stored as a hash, so the key of a tool that Glue reads opens
    // nothing. `readPost` gives the body of the post: it runs only for the
    // secret of an active Integration, so a post with another secret is
    // not read. Gives back the count of the new Signals.
    async addSignals(
      projectSlug: string,
      secret: string,
      readPost: () => Promise<unknown>,
    ) {
      const webhooks = await db
        .select({ id: integrations.id, state: integrations.state })
        .from(integrations)
        .innerJoin(projects, eq(integrations.projectId, projects.id))
        .where(
          and(
            eq(projects.slug, projectSlug),
            eq(integrations.encryptedKey, hashWebhookSecret(secret)),
          ),
        )
      const webhook = webhooks.at(0)
      if (!webhook) throw new WebhookSecretError()
      if (webhook.state !== 'active')
        throw new InvalidRecordError('The webhook is paused')
      const parsed = webhookPostSchema.safeParse(await readPost())
      if (!parsed.success)
        throw new InvalidRecordError(z.prettifyError(parsed.error))
      const at = now()
      const stored = await db
        .insert(webhookSignals)
        .values(
          parsed.data.signals.map(({ link, time, ...signal }) => ({
            ...signal,
            integrationId: webhook.id,
            url: link,
            at: time ? new Date(time) : at,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: webhookSignals.id })
      await db
        .update(integrations)
        .set({
          lastReadAt: at,
          lastReadSignalCount: stored.length,
          lastReadError: null,
        })
        .where(eq(integrations.id, webhook.id))
      return { stored: stored.length }
    },

    // One Signal source for each of the Integrations, under its address:
    // its stored Signals, the newest first. A paused Integration keeps the
    // Signals that it has.
    toSources(
      posting: ReadonlyArray<{ id: number; address: string }>,
    ): SignalSource[] {
      return posting.map(({ id, address }) => ({
        name: address,
        listSignals: async () => {
          const rows = await db
            .select()
            .from(webhookSignals)
            .where(eq(webhookSignals.integrationId, id))
            .orderBy(desc(webhookSignals.at), webhookSignals.id)
          return rows.map(({ url, title, text, at }) => ({
            url,
            title,
            text,
            date: at.toISOString().slice(0, 'yyyy-mm-dd'.length),
          }))
        },
      }))
    },
  }
}
