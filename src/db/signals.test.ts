import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { setProductRepository } from './projects.ts'
import { addProject } from './part-records.ts'
import { findPart } from './parts.ts'
import { InvalidRecordError } from './record-errors.ts'
import * as schema from './schema.ts'
import { createFakeGithub, failingGithub } from '../test/github.ts'
import { addSignalInsight, listSignals } from './signals.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
let fake: ReturnType<typeof createFakeGithub>

const slow = {
  url: 'https://github.com/timschoch/glue/issues/7',
  title: 'The list is slow',
  createdAt: '2026-10-02T08:00:00Z',
}
const lost = {
  url: 'https://github.com/timschoch/glue/issues/5',
  title: 'I lose my place in the list',
  createdAt: '2026-10-01T08:00:00Z',
}

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})

// The Project glue has a repository with two issues that carry the label.
// The Project flexibeck has no repository.
beforeEach(async () => {
  await client.exec('truncate projects restart identity cascade')
  fake = createFakeGithub([slow, lost])
  await addProject(db, 'glue')
  await setProductRepository(db, 'glue', 'timschoch/glue')
  await addProject(db, 'flexibeck')
})

afterAll(async () => {
  await client.close()
})

describe('listSignals', () => {
  it('reads the issues with the label user-feedback of the repository of the Project', async () => {
    const found = await listSignals(db, fake.github, 'glue')

    expect(fake.listed).toEqual([
      { repository: 'timschoch/glue', label: 'user-feedback' },
    ])
    expect(found).toEqual({
      reason: null,
      signals: [
        { url: slow.url, title: slow.title, date: '2026-10-02', insight: null },
        { url: lost.url, title: lost.title, date: '2026-10-01', insight: null },
      ],
    })
  })

  it('gives no Signal and the reason for a Project without a repository', async () => {
    const found = await listSignals(db, fake.github, 'flexibeck')

    expect(found).toEqual({
      signals: [],
      reason: 'The Project has no repository',
    })
    expect(fake.listed).toEqual([])
  })

  it('gives no Signal and the reason when GitHub fails', async () => {
    const found = await listSignals(db, failingGithub, 'glue')

    expect(found).toEqual({ signals: [], reason: 'GitHub answered 503' })
  })
})

describe('addSignalInsight', () => {
  it('adds a draft Insight at the level hunch that shows its Signals', async () => {
    const id = await addSignalInsight(db, fake.github, 'glue', {
      signals: [slow.url, lost.url],
      title: 'Long lists are hard to use',
    })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      id: 'I1',
      type: 'insight',
      title: 'Long lists are hard to use',
      evidenceLevel: 'hunch',
      workState: 'draft',
      source: 'https://github.com/timschoch/glue/labels/user-feedback',
      signals: [
        { url: slow.url, title: slow.title },
        { url: lost.url, title: lost.title },
      ],
    })
  })

  it('takes the source, the date and the level that the form gives', async () => {
    const id = await addSignalInsight(db, fake.github, 'glue', {
      signals: [slow.url],
      title: 'The list is slow',
      source: slow.url,
      date: '2026-10-04',
      evidenceLevel: 'pattern',
    })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      source: slow.url,
      date: '2026-10-04',
      evidenceLevel: 'pattern',
    })
  })

  it('shows the Insight on each Signal that it grew from', async () => {
    await addSignalInsight(db, fake.github, 'glue', {
      signals: [lost.url],
      title: 'People lose their place',
    })

    const { signals } = await listSignals(db, fake.github, 'glue')

    expect(signals.map(({ insight }) => insight)).toEqual([
      null,
      { id: 'I1', title: 'People lose their place' },
    ])
  })

  it('refuses an address that is not a Signal of the Project', async () => {
    await expect(
      addSignalInsight(db, fake.github, 'glue', {
        signals: ['https://github.com/timschoch/glue/issues/99'],
        title: 'A guess',
      }),
    ).rejects.toThrow(InvalidRecordError)
    expect(await findPart(db, 'glue', 'I1')).toBeUndefined()
  })

  it('refuses a Signal that grew into an Insight already', async () => {
    await addSignalInsight(db, fake.github, 'glue', {
      signals: [slow.url],
      title: 'The list is slow',
    })

    await expect(
      addSignalInsight(db, fake.github, 'glue', {
        signals: [slow.url],
        title: 'The list is slow again',
      }),
    ).rejects.toThrow(/grew into I1 already/)
    expect(await findPart(db, 'glue', 'I2')).toBeUndefined()
  })

  it('adds no Insight when the write of its Signals fails', async () => {
    // Two requests at the same time grow the same Signal. The second one
    // breaks the rule that a Signal grows into one Insight.
    const results = await Promise.allSettled([
      addSignalInsight(db, fake.github, 'glue', {
        signals: [slow.url],
        title: 'The list is slow',
      }),
      addSignalInsight(db, fake.github, 'glue', {
        signals: [slow.url],
        title: 'The list is slow again',
      }),
    ])

    expect(results.map(({ status }) => status)).toEqual([
      'fulfilled',
      'rejected',
    ])
    expect(await findPart(db, 'glue', 'I1')).toMatchObject({
      title: 'The list is slow',
      signals: [{ url: slow.url, title: slow.title }],
    })
    expect(await findPart(db, 'glue', 'I2')).toBeUndefined()
  })

  it('refuses a Project without a repository', async () => {
    await expect(
      addSignalInsight(db, fake.github, 'flexibeck', {
        signals: [slow.url],
        title: 'A guess',
      }),
    ).rejects.toThrow(/has no repository/)
  })
})
