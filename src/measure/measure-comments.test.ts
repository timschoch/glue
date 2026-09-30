import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findConcept, findRecord } from '../db/concept.ts'
import { addConceptRecord, setSocialHandle } from '../db/concept-records.ts'
import * as schema from '../db/schema.ts'
import { measureComments } from './measure-comments.ts'
import type { SentimentClassifier } from './sentiment.ts'
import type {
  CommentQuery,
  SocialChannel,
  SocialComment,
} from './social-channel.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

const NOW = new Date('2026-09-30T10:00:00Z')

beforeEach(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})

afterEach(async () => {
  await client.close()
})

async function addProduct(product: string, handle: string | null) {
  await addConceptRecord(
    db,
    product,
    'goals',
    { title: 'Users like it', metric: 'survey mean', source: 'okr' },
    '',
  )
  await setSocialHandle(db, product, handle)
}

// Holds comments per handle and answers like mock social: after `since`,
// oldest first. Keeps every query it gets.
function createFakeChannel() {
  const comments = new Map<string, SocialComment[]>()
  const queries: CommentQuery[] = []
  const channel: SocialChannel = {
    fetchComments: (query) => {
      queries.push(query)
      const found = (comments.get(query.handle) ?? []).filter(
        (comment) => !query.since || comment.createdAt > query.since,
      )
      return Promise.resolve(found)
    },
  }
  function post(handle: string, author: string, text: string, at: string) {
    const list = comments.get(handle) ?? []
    list.push({ author, text, createdAt: new Date(at) })
    comments.set(handle, list)
  }
  return { channel, queries, post }
}

// Labels a text by its words. Confidence grows with the text's `!`s, so a
// test can pick which comment is quoted.
const classifier: SentimentClassifier = {
  classify: (texts) =>
    Promise.resolve(
      texts.map((text) => {
        const score = 0.5 + text.split('!').length / 100
        if (/love|great/i.test(text)) return { sentiment: 'positive', score }
        if (/hate|too many/i.test(text)) return { sentiment: 'negative', score }
        return { sentiment: 'neutral', score }
      }),
    ),
}

const failingClassifier: SentimentClassifier = {
  classify: () => Promise.reject(new Error('Hugging Face answered 503')),
}

function runMeasure(
  channel: SocialChannel,
  options: {
    productSlug?: string
    dryRun?: boolean
    sentiment?: SentimentClassifier
  } = {},
) {
  const { sentiment = classifier, ...rest } = options
  return measureComments({
    db,
    channel,
    classifier: sentiment,
    now: NOW,
    ...rest,
  })
}

describe('measureComments', () => {
  it('writes one draft Insight with the counts and a quote per sentiment', async () => {
    await addProduct('flexibeck', 'flexibeck')
    const fake = createFakeChannel()
    fake.post('flexibeck', 'ada', 'I love the plans', '2026-09-28T09:00:00Z')
    fake.post('flexibeck', 'bob', 'Great app!!', '2026-09-28T10:00:00Z')
    fake.post('flexibeck', 'cy', 'Too many options', '2026-09-29T08:00:00Z')
    fake.post('flexibeck', 'dee', 'It works', '2026-09-29T09:00:00Z')
    fake.post('other', 'eve', 'I hate it', '2026-09-29T09:00:00Z')

    const written = await runMeasure(fake.channel)

    expect(fake.queries).toEqual([{ handle: 'flexibeck', since: null }])
    expect(written).toEqual([
      expect.objectContaining({ product: 'flexibeck', id: 'I1' }),
    ])
    const insight = await findRecord(db, 'flexibeck', 'I1')
    expect(insight).toMatchObject({
      kind: 'insight',
      title: 'Comments on flexibeck: 2 positive, 1 neutral, 1 negative',
      date: '2026-09-30',
      status: 'draft',
      source: 'mock-social://flexibeck/comments?until=2026-09-29T09:00:00.000Z',
    })
    expect(insight?.body).toBe(
      [
        '4 new comments on flexibeck from 2026-09-28 to 2026-09-29.',
        [
          '| Sentiment | Comments |',
          '| --- | --- |',
          '| positive | 2 |',
          '| neutral | 1 |',
          '| negative | 1 |',
        ].join('\n'),
        '## Quotes',
        [
          '- negative, cy: "Too many options"',
          '- neutral, dee: "It works"',
          '- positive, bob: "Great app!!"',
        ].join('\n'),
      ].join('\n\n'),
    )
  })

  it('counts a comment once: the next run reads after the last one', async () => {
    await addProduct('flexibeck', 'flexibeck')
    const fake = createFakeChannel()
    fake.post('flexibeck', 'ada', 'I love it', '2026-09-28T09:00:00.123Z')
    await runMeasure(fake.channel)

    const nothingNew = await runMeasure(fake.channel)
    fake.post('flexibeck', 'bob', 'I hate it', '2026-09-29T09:00:00Z')
    const [next] = await runMeasure(fake.channel)

    expect(nothingNew).toEqual([])
    expect(fake.queries.at(-1)).toEqual({
      handle: 'flexibeck',
      since: new Date('2026-09-28T09:00:00.123Z'),
    })
    expect(next.title).toBe(
      'Comments on flexibeck: 0 positive, 0 neutral, 1 negative',
    )
    expect(next.source).toBe(
      'mock-social://flexibeck/comments?since=2026-09-28T09:00:00.123Z&until=2026-09-29T09:00:00.000Z',
    )
    const concept = await findConcept(db, 'flexibeck')
    expect(concept?.insights.map((insight) => insight.id)).toEqual(['I1', 'I2'])
  })

  it('writes one Insight when two runs overlap', async () => {
    await addProduct('flexibeck', 'flexibeck')
    const fake = createFakeChannel()
    fake.post('flexibeck', 'ada', 'I love it', '2026-09-28T09:00:00Z')

    await Promise.all([runMeasure(fake.channel), runMeasure(fake.channel)])

    const concept = await findConcept(db, 'flexibeck')
    expect(concept?.insights.map((insight) => insight.id)).toEqual(['I1'])
  })

  it('reads the comments again after the classifier failed', async () => {
    await addProduct('flexibeck', 'flexibeck')
    const fake = createFakeChannel()
    fake.post('flexibeck', 'ada', 'I love it', '2026-09-28T09:00:00Z')

    await expect(
      runMeasure(fake.channel, { sentiment: failingClassifier }),
    ).rejects.toThrow(/503/)
    const [insight] = await runMeasure(fake.channel)

    expect(insight.title).toBe(
      'Comments on flexibeck: 1 positive, 0 neutral, 0 negative',
    )
  })

  it('writes nothing and keeps the read position in a dry run', async () => {
    await addProduct('flexibeck', 'flexibeck')
    const fake = createFakeChannel()
    fake.post('flexibeck', 'ada', 'I love it', '2026-09-28T09:00:00Z')

    const [dry] = await runMeasure(fake.channel, { dryRun: true })
    const [real] = await runMeasure(fake.channel)

    expect(dry).toMatchObject({ product: 'flexibeck', id: null })
    expect(real).toMatchObject({ id: 'I1', title: dry.title })
  })

  it('reads only Products with a social handle, and only the one it is given', async () => {
    await addProduct('flexibeck', 'flexibeck')
    await addProduct('glue', 'glue_app')
    await addProduct('quiet', null)
    const fake = createFakeChannel()

    await runMeasure(fake.channel)
    await runMeasure(fake.channel, { productSlug: 'glue' })

    expect(fake.queries.map((query) => query.handle)).toEqual([
      'flexibeck',
      'glue_app',
      'glue_app',
    ])
  })

  it('reads a new handle from the start', async () => {
    await addProduct('flexibeck', 'old')
    const fake = createFakeChannel()
    fake.post('old', 'ada', 'I love it', '2026-09-28T09:00:00Z')
    await runMeasure(fake.channel)

    await setSocialHandle(db, 'flexibeck', 'new')
    await runMeasure(fake.channel)

    expect(fake.queries.at(-1)).toEqual({ handle: 'new', since: null })
  })
})
