import { describe, expect, it } from 'vitest'

import { setProductRepository } from './projects.ts'
import { addProject } from './part-records.ts'
import { findPart } from './parts.ts'
import { InvalidRecordError } from './record-errors.ts'
import * as schema from './schema.ts'
import { addSignalInsight, listSignals } from './signals.ts'
import type { SignalProject, SignalSource, SourceSignal } from './signals.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

const slow: SourceSignal = {
  url: 'https://github.com/timschoch/glue/issues/7',
  title: 'The list is slow',
  text: 'It takes five seconds to open.',
  date: '2026-10-02',
}
const lost: SourceSignal = {
  url: 'https://github.com/timschoch/glue/issues/5',
  title: 'I lose my place in the list',
  text: '',
  date: '2026-09-30',
}
const refund: SourceSignal = {
  url: 'https://support.test/agent/tickets/3',
  title: 'Where is my refund?',
  text: 'I asked two weeks ago.',
  date: '2026-10-01',
}

// A source that gives the same Signals for each Project, and keeps the
// Projects that it was asked for.
function createFakeSource(name: string, signals: SourceSignal[]) {
  const asked: SignalProject[] = []
  const source: SignalSource = {
    name,
    listSignals: async (project) => {
      asked.push(project)
      return signals
    },
  }
  return { source, asked }
}

// A ticket that says what the issue `slow` says.
const slowTicket: SourceSignal = {
  url: 'https://support.test/agent/tickets/4',
  title: 'The list is slow to open',
  text: '',
  date: '2026-09-29',
}

const github = createFakeSource('github', [slow, lost]).source
const support = createFakeSource('support', [refund]).source
const slowSupport = createFakeSource('support', [refund, slowTicket]).source
const failing: SignalSource = {
  name: 'analytics',
  listSignals: () => Promise.reject(new Error('mock analytics answered 503')),
}

async function addGlue() {
  await addProject(db, 'glue')
  await setProductRepository(db, 'glue', 'timschoch/glue')
}

describe('listSignals', () => {
  it('lists the Signals of each source with its name, the newest first', async () => {
    await addGlue()

    const found = await listSignals(db, [github, support], 'glue')

    expect(found).toEqual({
      failures: [],
      signals: [
        { ...slow, source: 'github', insight: null },
        { ...refund, source: 'support', insight: null },
        { ...lost, source: 'github', insight: null },
      ],
      groups: [],
    })
  })

  it('asks each source with the settings of the Project', async () => {
    await addGlue()
    const fake = createFakeSource('github', [])

    await listSignals(db, [fake.source], 'glue')

    expect(fake.asked).toMatchObject([
      { repository: 'timschoch/glue', analyticsProject: null },
    ])
  })

  it('lists only the Signals of the named source', async () => {
    await addGlue()

    const found = await listSignals(db, [github, support, failing], 'glue', {
      source: 'support',
    })

    expect(found).toEqual({
      failures: [],
      signals: [{ ...refund, source: 'support', insight: null }],
      groups: [],
    })
  })

  it('keeps the Signals of the other sources when one source fails, and names it', async () => {
    await addGlue()

    const found = await listSignals(db, [failing, support], 'glue')

    expect(found).toEqual({
      failures: [
        { source: 'analytics', reason: 'mock analytics answered 503' },
      ],
      signals: [{ ...refund, source: 'support', insight: null }],
      groups: [],
    })
  })

  it('groups the Signals that say the same thing, and names their sources', async () => {
    await addGlue()

    const { groups } = await listSignals(db, [github, slowSupport], 'glue')

    expect(groups).toEqual([
      {
        title: slow.title,
        signals: [slow.url, slowTicket.url],
        sources: ['github', 'support'],
      },
    ])
  })

  it('puts a Signal that grew into an Insight in no group', async () => {
    await addGlue()
    await addSignalInsight(db, [github, slowSupport], 'glue', {
      signals: [slowTicket.url],
      title: 'Lists are slow',
    })

    const { groups } = await listSignals(db, [github, slowSupport], 'glue')

    expect(groups).toEqual([])
  })

  it('refuses a name that no source has', async () => {
    await addGlue()

    await expect(
      listSignals(db, [github, support], 'glue', { source: 'crm' }),
    ).rejects.toThrow('"crm" is no Signal source: github, support')
  })
})

describe('addSignalInsight', () => {
  const sources = [github, support]

  it('adds a draft Insight at the level hunch that shows its Signals of each source', async () => {
    await addGlue()

    const id = await addSignalInsight(db, sources, 'glue', {
      signals: [slow.url, refund.url],
      title: 'People wait too long',
    })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      id: 'I1',
      type: 'insight',
      title: 'People wait too long',
      evidenceLevel: 'hunch',
      workState: 'draft',
      source:
        'https://github.com/timschoch/glue/issues/7 https://support.test/agent/tickets/3',
      signals: [
        { url: slow.url, title: slow.title },
        { url: refund.url, title: refund.title },
      ],
    })
  })

  it('takes the title of the newest Signal when the input names none', async () => {
    await addGlue()

    const id = await addSignalInsight(db, [github, slowSupport], 'glue', {
      signals: [slowTicket.url, slow.url],
    })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      title: 'The list is slow',
      evidenceLevel: 'hunch',
      signals: [
        { url: slowTicket.url, title: slowTicket.title },
        { url: slow.url, title: slow.title },
      ],
    })
  })

  it('takes the words of the user as the title when Glue gave the newest Signal its title', async () => {
    await addGlue()
    const answers = ['Too many options to pick from', ''].map(
      (text, index): SourceSignal => ({
        url: `https://analytics.test/events/${index + 1}`,
        title: 'Survey answer 2 of 7',
        titleBy: 'glue',
        text,
        date: '2026-10-03',
      }),
    )
    const analytics = createFakeSource('analytics', answers).source

    const worded = await addSignalInsight(db, [analytics], 'glue', {
      signals: [answers[0].url],
    })
    const bare = await addSignalInsight(db, [analytics], 'glue', {
      signals: [answers[1].url],
    })

    expect(await findPart(db, 'glue', worded)).toMatchObject({
      title: 'Too many options to pick from',
    })
    expect(await findPart(db, 'glue', bare)).toMatchObject({
      title: 'Survey answer 2 of 7',
    })
  })

  it('takes the source, the date and the level that the form gives', async () => {
    await addGlue()

    const id = await addSignalInsight(db, sources, 'glue', {
      signals: [slow.url],
      title: 'The list is slow',
      source: 'A talk with Ada',
      date: '2026-10-04',
      evidenceLevel: 'pattern',
    })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      source: 'A talk with Ada',
      date: '2026-10-04',
      evidenceLevel: 'pattern',
    })
  })

  it('shows the Insight on each Signal that it grew from', async () => {
    await addGlue()
    await addSignalInsight(db, sources, 'glue', {
      signals: [refund.url],
      title: 'Refunds take too long',
    })

    const { signals } = await listSignals(db, sources, 'glue')

    expect(signals.map(({ insight }) => insight)).toEqual([
      null,
      { id: 'I1', title: 'Refunds take too long' },
      null,
    ])
  })

  it('refuses an address that is not a Signal of the Project', async () => {
    await addGlue()

    await expect(
      addSignalInsight(db, sources, 'glue', {
        signals: ['https://github.com/timschoch/glue/issues/99'],
        title: 'A guess',
      }),
    ).rejects.toThrow(InvalidRecordError)
    expect(await findPart(db, 'glue', 'I1')).toBeUndefined()
  })

  it('refuses a Signal that grew into an Insight already', async () => {
    await addGlue()
    await addSignalInsight(db, sources, 'glue', {
      signals: [slow.url],
      title: 'The list is slow',
    })

    await expect(
      addSignalInsight(db, sources, 'glue', {
        signals: [slow.url],
        title: 'The list is slow again',
      }),
    ).rejects.toThrow(/grew into I1 already/)
    expect(await findPart(db, 'glue', 'I2')).toBeUndefined()
  })

  it('adds no Insight when the write of its Signals fails', async () => {
    await addGlue()
    // Two requests at the same time grow the same Signal. The second one
    // breaks the rule that a Signal grows into one Insight.
    const results = await Promise.allSettled([
      addSignalInsight(db, sources, 'glue', {
        signals: [slow.url],
        title: 'The list is slow',
      }),
      addSignalInsight(db, sources, 'glue', {
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
})
