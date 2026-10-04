import { describe, expect, it } from 'vitest'

import type { Part, PartSummary } from '../db/parts.ts'
import { toRecordPart } from './part-views.ts'

const goal: PartSummary = {
  id: 'G1',
  type: 'goal',
  title: 'More users pay',
  status: 'open',
  trust: 'solid',
  workState: 'published',
  concept: 'glue',
  conceptTitle: 'Glue',
}

const insight: PartSummary = {
  id: 'I1',
  type: 'insight',
  title: 'Bakers want step videos',
  status: null,
  trust: 'solid',
  workState: 'published',
  concept: 'part-model',
  conceptTitle: 'Part model',
}

const decision: Part = {
  id: 'D1',
  type: 'decision',
  title: 'Show the video of the creator',
  status: 'accepted',
  trust: 'solid',
  workState: 'published',
  concept: 'part-model',
  conceptTitle: 'Part model',
  body: 'From #I1.',
  owner: 'Tim',
  date: '2026-10-02',
  source: null,
  metric: null,
  enforcedBy: null,
  evidenceLevel: null,
  issueUrl: 'https://github.com/timschoch/glue/issues/1',
  measure: null,
  supersededBy: null,
  supersedes: [],
  needs: [
    { jointId: 1, twoWay: false, link: true, part: goal },
    { jointId: 2, twoWay: false, link: false, part: insight },
  ],
  neededBy: [],
  flags: [],
  waitsOn: null,
  signals: [],
  answers: ['not-ready', 'sink'],
  activity: [],
}

const href = ({ id }: PartSummary) => `/glue/${id}`

describe('a Part in the record view', () => {
  it('names the home Concept, with the address and the Trust of each card', () => {
    const record = toRecordPart(decision, href)

    expect(record).toMatchObject({
      id: 'D1',
      concept: 'Part model',
      trust: 'solid',
      workState: 'published',
      href: '/glue/D1',
      body: 'From #I1.',
      issueUrl: 'https://github.com/timschoch/glue/issues/1',
    })
    expect(record.needs).toEqual([
      {
        jointId: 1,
        link: true,
        part: {
          id: 'G1',
          type: 'goal',
          title: 'More users pay',
          concept: 'Glue',
          trust: 'solid',
          href: '/glue/G1',
        },
      },
      {
        jointId: 2,
        link: false,
        part: {
          id: 'I1',
          type: 'insight',
          title: 'Bakers want step videos',
          concept: 'Part model',
          trust: 'solid',
          href: '/glue/I1',
        },
      },
    ])
  })

  it('has the Trust and the Work state of the Part, not a guess from the status', () => {
    const record = toRecordPart(
      {
        ...decision,
        trust: 'wrong',
        workState: 'sunk',
        needs: [
          {
            jointId: 1,
            twoWay: false,
            link: true,
            part: { ...goal, trust: 'flagged' },
          },
        ],
      },
      href,
    )

    expect(record).toMatchObject({ trust: 'wrong', workState: 'sunk' })
    expect(record.needs[0].part.trust).toBe('flagged')
  })

  it('shows the Decision that supersedes it and the ones it supersedes', () => {
    const record = toRecordPart(
      { ...decision, supersededBy: goal, supersedes: [insight] },
      href,
    )

    expect(record.supersededBy?.href).toBe('/glue/G1')
    expect(record.supersedes.map((part) => part.href)).toEqual(['/glue/I1'])
  })

  it('shows each open flag with its reason and the card of its cause', () => {
    const record = toRecordPart(
      {
        ...decision,
        flags: [
          {
            cause: { id: 'I1', title: 'Bakers want step videos' },
            reason: 'changed',
            createdAt: '2026-10-03T08:00:00.000Z',
          },
        ],
      },
      href,
      [goal, insight],
    )

    expect(record.flags).toEqual([
      {
        reason: 'changed',
        part: {
          id: 'I1',
          type: 'insight',
          title: 'Bakers want step videos',
          concept: 'Part model',
          trust: 'solid',
          href: '/glue/I1',
        },
      },
    ])
  })

  it('shows what happened, with the card of the cause of each flag', () => {
    const record = toRecordPart(
      {
        ...decision,
        activity: [
          {
            kind: 'flag-opened',
            at: '2026-10-03T08:00:00.000Z',
            cause: { id: 'I1', title: 'Bakers want step videos' },
            reason: 'changed',
          },
          { kind: 'published', at: '2026-10-02T08:00:00.000Z' },
        ],
      },
      href,
      [goal, insight],
    )

    expect(record.activity).toEqual([
      {
        kind: 'flag-opened',
        at: '2026-10-03T08:00:00.000Z',
        flag: {
          reason: 'changed',
          part: expect.objectContaining({ id: 'I1', href: '/glue/I1' }),
        },
      },
      { kind: 'published', at: '2026-10-02T08:00:00.000Z', flag: undefined },
    ])
  })

  it('shows the target of the measure and the day of the last reading', () => {
    const record = toRecordPart(
      {
        ...decision,
        measure: {
          measure: {
            kind: 'funnel',
            source: 'mock-analytics',
            steps: ['signed-up', 'paid'],
            target: 0.2,
            window_days: 7,
          },
          baseline: 0.1,
          latestValue: 0.15,
          latestBreakdownValue: null,
          measuredAt: '2026-10-02T08:00:00.000Z',
        },
      },
      href,
    )

    expect(record.measure).toEqual({
      baseline: 0.1,
      latestValue: 0.15,
      target: 0.2,
      measuredAt: '2026-10-02',
    })
  })
})
