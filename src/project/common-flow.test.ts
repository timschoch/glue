import { describe, expect, it } from 'vitest'

import type { Gate } from '../db/gate.ts'
import type { Part, PartSummary } from '../db/parts.ts'
import { findCommonFlow } from './common-flow.ts'

const summary: PartSummary = {
  id: 'D1',
  type: 'decision',
  title: 'Show the video of the creator',
  status: 'accepted',
  trust: 'solid',
  workState: 'published',
  concept: 'glue',
  conceptTitle: 'Glue',
  emptySlots: [],
  reviewNotes: [],
}

const published: Part = {
  ...summary,
  body: '',
  owner: 'Tim',
  date: '2026-10-02',
  source: null,
  metric: null,
  enforcedBy: null,
  evidenceLevel: null,
  issueUrl: null,
  measure: null,
  measured: [],
  supersededBy: null,
  supersedes: [],
  needs: [],
  neededBy: [],
  flags: [],
  waitsOn: null,
  signals: [],
  answers: ['not-ready', 'sink'],
  activity: [],
  question: null,
  unchosen: false,
}

const CHECKED_AT = '2026-10-05T09:00:00.000Z'

const draft = {
  trust: 'not-ready',
  workState: 'draft',
  answers: ['supersede', 'not-ready', 'sink'],
} satisfies Partial<Part>

function neededBy(...types: Array<PartSummary['type']>): Part['neededBy'] {
  return types.map((type, jointId) => ({
    jointId,
    twoWay: false,
    link: false,
    contractVersion: null,
    part: { ...summary, id: `X${jointId}`, type },
  }))
}

describe('the common flow of a Part', () => {
  it('asks to raise the level of an Insight that is a hunch', () => {
    expect(
      findCommonFlow({ ...published, type: 'insight', evidenceLevel: 'hunch' }),
    ).toEqual({
      name: 'Evidence to Insight',
      steps: ['Group', 'Check', 'Verify'],
      current: 1,
      next: { kind: 'edit', label: 'Raise the level' },
    })
  })

  it('proposes Pattern for a Hunch whose Signals come from two sources', () => {
    const hunch = {
      ...published,
      ...draft,
      type: 'insight',
      evidenceLevel: 'hunch',
    } as const
    const raise = { kind: 'raise', level: 'pattern', label: 'Raise to Pattern' }

    expect(findCommonFlow(hunch, [], undefined, ['github', 'support'])).toEqual(
      {
        name: 'Evidence to Insight',
        steps: ['Group', 'Check', 'Verify'],
        current: 0,
        next: raise,
      },
    )
    expect(
      findCommonFlow({ ...published, type: 'insight' }, [], undefined, [
        'github',
        'support',
      ])?.next,
    ).toEqual(raise)
  })

  it('proposes no Pattern for Signals of one source, a Pattern or a flag', () => {
    const hunch = { ...published, ...draft, type: 'insight' } as const
    const sources = ['github', 'support']

    expect(findCommonFlow(hunch, [], undefined, ['github'])?.next).toEqual({
      kind: 'answer',
      answer: 'supersede',
    })
    expect(
      findCommonFlow(
        { ...hunch, evidenceLevel: 'pattern' },
        [],
        undefined,
        sources,
      )?.next,
    ).toEqual({ kind: 'answer', answer: 'supersede' })
    expect(
      findCommonFlow(
        { ...hunch, workState: 'to-check' },
        [],
        undefined,
        sources,
      )?.next,
    ).toEqual({ kind: 'answer', answer: 'fine' })
  })

  it('moves an Insight one step with each Evidence level', () => {
    const insight = { ...published, type: 'insight' } as const

    expect(findCommonFlow({ ...insight, ...draft })?.current).toBe(0)
    expect(
      findCommonFlow({ ...insight, evidenceLevel: 'pattern' })?.current,
    ).toBe(2)
  })

  it('asks for a Decision from a confirmed Insight that no Decision needs', () => {
    const insight = {
      ...published,
      type: 'insight',
      evidenceLevel: 'confirmed',
    } as const

    expect(findCommonFlow(insight)).toMatchObject({
      current: 3,
      next: { kind: 'add', type: 'decision', label: 'Add Decision' },
    })
    expect(
      findCommonFlow({ ...insight, neededBy: neededBy('decision') })?.next,
    ).toBeUndefined()
  })

  it('asks for a Decision on a Goal that has none', () => {
    expect(findCommonFlow({ ...published, type: 'goal' })).toEqual({
      name: 'Insight to Decision',
      steps: ['Set Goal', 'Choose', 'Sign'],
      current: 1,
      next: { kind: 'add', type: 'decision', label: 'Add Decision' },
    })
  })

  it('ends the flow of a Goal with its Decision', () => {
    expect(
      findCommonFlow({
        ...published,
        type: 'goal',
        neededBy: neededBy('decision'),
      }),
    ).toMatchObject({ current: 3, next: undefined })
  })

  it('asks for the sign-off of a Decision in review', () => {
    expect(
      findCommonFlow({ ...published, ...draft, workState: 'review' }),
    ).toEqual({
      name: 'Insight to Decision',
      steps: ['Set Goal', 'Choose', 'Sign'],
      current: 2,
      next: { kind: 'answer', answer: 'supersede' },
    })
  })

  it('asks for a Flow on a published Decision with no Flow and no Entity', () => {
    expect(findCommonFlow(published)).toEqual({
      name: 'Decision to Brief',
      steps: ['Fill slots', 'Sign'],
      current: 0,
      next: { kind: 'add', type: 'flow', label: 'Add Flow' },
    })
  })

  it('sends a Decision with an Entity to its Concept for the sign-off', () => {
    expect(
      findCommonFlow({ ...published, neededBy: neededBy('entity') }),
    ).toMatchObject({
      current: 1,
      next: { kind: 'concept', label: 'Open Concept' },
    })
  })

  it('counts no sunk Part', () => {
    const [sunk] = neededBy('flow')

    expect(
      findCommonFlow({
        ...published,
        neededBy: [{ ...sunk, part: { ...sunk.part, workState: 'sunk' } }],
      })?.current,
    ).toBe(0)
  })

  it('sends a published tier 1 Part to its Concept for the sign-off', () => {
    for (const type of ['flow', 'entity', 'guardrail'] as const) {
      expect(findCommonFlow({ ...published, type })).toEqual({
        name: 'Decision to Brief',
        steps: ['Fill slots', 'Sign'],
        current: 1,
        next: { kind: 'concept', label: 'Open Concept' },
      })
    }
  })

  it('asks for the sign-off of a draft', () => {
    expect(findCommonFlow({ ...published, ...draft, type: 'flow' })).toEqual({
      name: 'Decision to Brief',
      steps: ['Fill slots', 'Sign'],
      current: 0,
      next: { kind: 'answer', answer: 'supersede' },
    })
    expect(
      findCommonFlow({ ...published, ...draft, type: 'goal' }),
    ).toMatchObject({ current: 0, next: { answer: 'supersede' } })
  })

  it('asks for an Insight from a published Metric', () => {
    expect(findCommonFlow({ ...published, type: 'metric' })).toEqual({
      name: 'Use to Insight',
      steps: ['Measure', 'Read'],
      current: 1,
      next: { kind: 'add', type: 'insight', label: 'Add Insight' },
    })
  })

  it('shows the flow of a flag on a Part of any type, with the usual answer', () => {
    expect(
      findCommonFlow({
        ...published,
        type: 'flow',
        trust: 'flagged',
        workState: 'to-check',
        answers: ['fine', 'wait', 'need-time', 'not-ready', 'sink'],
      }),
    ).toEqual({
      name: 'React to a change',
      steps: ['Check', 'Answer'],
      current: 0,
      next: { kind: 'answer', answer: 'fine' },
    })
  })

  it('keeps a waiting Part at the answer, with no next step', () => {
    expect(
      findCommonFlow({ ...published, trust: 'flagged', workState: 'waiting' }),
    ).toMatchObject({ name: 'React to a change', current: 1, next: undefined })
  })

  it('puts a published Decision with a build at the gate', () => {
    expect(findCommonFlow(published, [{ number: 12, gate: null }])).toEqual({
      name: 'Brief to build',
      steps: ['Version', 'Build', 'Gate'],
      current: 2,
      next: undefined,
    })
  })

  it('ends the flow of a build when the gate of the newest build holds', () => {
    const holds: Gate = {
      result: 'holds',
      reasons: [],
      checkedAt: CHECKED_AT,
    }
    const breaks: Gate = {
      result: 'breaks',
      reasons: ['Decision "D1" is sunk and has no successor.'],
      checkedAt: CHECKED_AT,
    }

    expect(
      findCommonFlow(published, [
        { number: 11, gate: breaks },
        { number: 12, gate: holds },
      ])?.current,
    ).toBe(3)
    expect(
      findCommonFlow(published, [
        { number: 12, gate: breaks },
        { number: 11, gate: holds },
      ])?.current,
    ).toBe(2)
  })

  it('keeps a flag before the flow of a build', () => {
    expect(
      findCommonFlow(
        { ...published, trust: 'flagged', workState: 'to-check' },
        [{ number: 12, gate: null }],
      )?.name,
    ).toBe('React to a change')
  })

  it('shows the steps of an open Ask on a Hunch, and keeps its next step', () => {
    const hunch = {
      ...published,
      type: 'insight',
      evidenceLevel: 'hunch',
    } as const

    expect(findCommonFlow(hunch, [], 'pick')).toEqual({
      name: 'Ask another team',
      steps: ['Ask', 'Pick', 'Hand back'],
      current: 1,
      next: { kind: 'edit', label: 'Raise the level' },
    })
    expect(findCommonFlow(hunch, [], 'hand-back')?.current).toBe(2)
  })

  it('asks for the glue of the Insight that an Ask handed back', () => {
    const hunch = {
      ...published,
      type: 'insight',
      evidenceLevel: 'hunch',
    } as const

    expect(findCommonFlow(hunch, [], 'check')).toEqual({
      name: 'Ask another team',
      steps: ['Ask', 'Pick', 'Hand back'],
      current: 3,
      next: { kind: 'glue', label: 'Check and glue' },
    })
  })

  it('keeps a flag before the flow of an Ask', () => {
    const flagged = { ...published, workState: 'to-check' } as const

    expect(findCommonFlow(flagged, [], 'pick')?.name).toBe('React to a change')
  })

  it('has no flow for a sunk Part', () => {
    expect(
      findCommonFlow({ ...published, trust: 'wrong', workState: 'sunk' }),
    ).toBeUndefined()
  })
})
