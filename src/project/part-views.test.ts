import { describe, expect, it } from 'vitest'

import type { Part, PartMeasure, PartSummary } from '../db/parts.ts'
import { toReading, toRecordPart } from './part-views.ts'

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
  measured: [],
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
  question: null,
  unchosen: false,
}

const href = ({ id }: PartSummary) => `/glue/${id}`

// A funnel that misses its target.
const funnelReading: PartMeasure = {
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
  target: 0.2,
  onTarget: false,
}

describe('the reading on a card', () => {
  it('shows the value of a funnel and its target as a share', () => {
    expect(toReading(funnelReading)).toEqual({
      value: '15%',
      target: '20%',
      onTarget: false,
    })
  })

  it('shows the value of a mean and its target as a number', () => {
    const reading = toReading({
      measure: {
        kind: 'mean',
        source: 'mock-analytics',
        event: 'survey sent',
        property: '$survey_response',
        target_change: 1,
        window_days: 7,
      },
      baseline: 4.5,
      latestValue: 5.666,
      latestBreakdownValue: null,
      measuredAt: '2026-10-02T08:00:00.000Z',
      target: 5.5,
      onTarget: true,
    })

    expect(reading).toEqual({ value: '5.67', target: '5.5', onTarget: true })
  })

  it('has no value before the first reading', () => {
    const reading = toReading({
      ...funnelReading,
      latestValue: null,
      measuredAt: null,
      onTarget: null,
    })

    expect(reading).toEqual({ target: '20%' })
  })

  it('has no value and no target without a measure', () => {
    expect(toReading(null)).toEqual({})
  })
})

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

  it('gives a reference the name of its Project and the address in that Project', () => {
    const record = toRecordPart(
      {
        ...decision,
        needs: [
          {
            jointId: 1,
            twoWay: false,
            link: true,
            project: { slug: 'glue', name: 'Glue' },
            part: goal,
          },
        ],
      },
      ({ id }, project = 'glue-build') => `/${project}/${id}`,
    )

    expect(record.href).toBe('/glue-build/D1')
    expect(record.needs).toEqual([
      {
        jointId: 1,
        link: true,
        project: 'Glue',
        part: {
          id: 'G1',
          type: 'goal',
          title: 'More users pay',
          concept: 'Glue',
          trust: 'solid',
          href: '/glue/G1',
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

  it('has the question of a Decision, and that it was not chosen', () => {
    const question = { options: ['Yes', 'No'], pick: 1, answer: null }
    const record = toRecordPart({ ...decision, question, unchosen: true }, href)

    expect(record).toMatchObject({ question, unchosen: true })
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
    const record = toRecordPart({ ...decision, measure: funnelReading }, href)

    expect(record.measure).toEqual({
      baseline: 0.1,
      latestValue: 0.15,
      target: 0.2,
      measuredAt: '2026-10-02',
    })
  })

  it('shows the reading of a Goal that it serves on the card of the Goal', () => {
    const record = toRecordPart(
      { ...decision, measured: [{ ...goal, measure: funnelReading }] },
      href,
    )

    expect(record.needs.map(({ part }) => part.reading)).toEqual([
      { value: '15%', target: '20%', onTarget: false },
      undefined,
    ])
  })
})
