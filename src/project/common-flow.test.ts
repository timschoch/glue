import { describe, expect, it } from 'vitest'

import type { Gate } from '../db/gate.ts'
import type { Part, PartSummary } from '../db/parts.ts'
import type { ContractState } from '../db/contracts.ts'
import { findCommonFlow, findConceptFlow, isBuilt } from './common-flow.ts'
import type { GatedBuild } from './common-flow.ts'

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
  evidenceBase: null,
  steps: [],
  fields: [],
  issueUrl: null,
  measure: null,
  measured: [],
  goalMetrics: [],
  supersededBy: null,
  supersedes: [],
  needs: [],
  neededBy: [],
  flags: [],
  waitsOn: null,
  signals: [],
  answers: ['not-ready', 'sink'],
  activity: [],
  versions: [],
  question: null,
  unchosen: false,
}

const CHECKED_AT = '2026-10-05T09:00:00.000Z'

const holds: Gate = {
  result: 'holds',
  reasons: [],
  guardrails: [],
  checkedAt: CHECKED_AT,
}
const breaks: Gate = {
  result: 'breaks',
  reasons: ['Decision "D1" is sunk and has no successor.'],
  guardrails: [],
  checkedAt: CHECKED_AT,
}

// A build that names the Part, and no Contract Version. No gate checked it.
const build: GatedBuild = {
  number: 12,
  url: 'https://github.com/timschoch/glue/pull/12',
  contract: null,
  gate: null,
}

// The newest Contract Version of the Concept.
const contract = {
  concept: 'glue',
  title: 'Glue',
  version: 2,
  newestVersion: 2,
}

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

// Two Signals of two sources on one day.
const twoSources = [
  { source: 'github', date: '2026-10-01' },
  { source: 'support', date: '2026-10-01' },
]

describe('the common flow of a Part', () => {
  it('asks a Hunch whose Signals do not agree for the second source', () => {
    expect(
      findCommonFlow({ ...published, type: 'insight', evidenceLevel: 'hunch' }),
    ).toEqual({
      name: 'Evidence to Insight',
      steps: ['Group', 'Check', 'Verify'],
      current: 1,
      next: { kind: 'raise', label: 'Raise to Pattern', needsSource: true },
    })
  })

  it('opens the Hunch of a published Decision that rests on it', () => {
    const needs = [
      {
        jointId: 1,
        twoWay: false,
        link: false,
        contractVersion: null,
        part: { ...summary, id: 'I1', type: 'insight' as const },
      },
    ]
    const open = {
      kind: 'open',
      part: { id: 'I1', concept: 'glue' },
      label: `Open I1 ${summary.title}`,
    }
    const decision = { ...published, evidenceBase: 'hunch' as const, needs }

    expect(findCommonFlow(decision)).toEqual({
      name: 'Decision to Brief',
      steps: ['Fill slots', 'Sign'],
      current: 0,
      next: open,
    })
    expect(findCommonFlow(decision, [build])?.next).toEqual(open)
  })

  it('proposes Pattern for a Hunch whose one source keeps giving Signals', () => {
    const overTime = [
      { source: 'github', date: '2026-10-01' },
      { source: 'github', date: '2026-10-04' },
      { source: 'github', date: '2026-10-08' },
    ]

    expect(
      findCommonFlow({ ...published, type: 'insight' }, [], undefined, overTime)
        ?.next,
    ).toEqual({ kind: 'raise', label: 'Raise to Pattern', needsSource: false })
  })

  it('asks to verify a Pattern', () => {
    expect(
      findCommonFlow({
        ...published,
        type: 'insight',
        evidenceLevel: 'pattern',
      }),
    ).toEqual({
      name: 'Evidence to Insight',
      steps: ['Group', 'Check', 'Verify'],
      current: 2,
      next: { kind: 'verify', label: 'Verify' },
    })
  })

  it('opens the Hunch of a Decision that rests on a Hunch, in place of the sign-off', () => {
    const hunch = {
      ...summary,
      id: 'I1',
      type: 'insight',
      title: 'Loads are slow',
    } as const
    const needs = [
      {
        jointId: 1,
        twoWay: false,
        link: false,
        contractVersion: null,
        part: hunch,
      },
    ]

    expect(
      findCommonFlow({
        ...published,
        ...draft,
        workState: 'review',
        evidenceBase: 'hunch',
        needs,
      })?.next,
    ).toEqual({
      kind: 'open',
      part: { id: 'I1', concept: 'glue' },
      label: 'Open I1 Loads are slow',
    })
  })

  it('proposes Pattern for a Hunch whose Signals come from two sources', () => {
    const hunch = {
      ...published,
      ...draft,
      type: 'insight',
      evidenceLevel: 'hunch',
    } as const
    const raise = {
      kind: 'raise',
      label: 'Raise to Pattern',
      needsSource: false,
    }

    expect(findCommonFlow(hunch, [], undefined, twoSources)).toEqual({
      name: 'Evidence to Insight',
      steps: ['Group', 'Check', 'Verify'],
      current: 0,
      next: raise,
    })
    expect(
      findCommonFlow(
        { ...published, type: 'insight' },
        [],
        undefined,
        twoSources,
      )?.next,
    ).toEqual(raise)
  })

  it('proposes no Pattern for Signals of one source, a Pattern or a flag', () => {
    const hunch = { ...published, ...draft, type: 'insight' } as const
    const sources = twoSources

    expect(
      findCommonFlow(hunch, [], undefined, twoSources.slice(0, 1))?.next,
    ).toEqual({ kind: 'answer', answer: 'supersede' })
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
    ).toMatchObject({
      current: 3,
      next: { kind: 'open', label: 'Open X0 Show the video of the creator' },
    })
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
      steps: ['Read'],
      current: 0,
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

  it('keeps a build that names no Contract Version at the step Version', () => {
    expect(findCommonFlow(published, [build])).toEqual({
      name: 'Brief to build',
      steps: ['Version', 'Build', 'Gate'],
      current: 0,
      next: {
        kind: 'link',
        href: 'https://github.com/timschoch/glue/pull/12',
        label: 'Open build 12',
      },
    })
  })

  it('builds from the Contract Version that the build names, until a gate checks it', () => {
    expect(findCommonFlow(published, [{ ...build, contract }])).toMatchObject({
      current: 1,
      next: { kind: 'link', label: 'Open build 12' },
    })
  })

  it('puts a build at the gate while its gate breaks', () => {
    expect(
      findCommonFlow(published, [{ ...build, contract, gate: breaks }]),
    ).toMatchObject({
      current: 2,
      next: { kind: 'link', label: 'Open build 12' },
    })
  })

  it('asks a Decision for a Metric when the gate of its newest build holds', () => {
    expect(
      findCommonFlow(published, [
        { ...build, number: 11, gate: breaks },
        { ...build, gate: holds },
      ]),
    ).toEqual({
      name: 'Use to Insight',
      steps: ['Read'],
      current: 0,
      next: { kind: 'add', type: 'metric', label: 'Add Metric' },
    })
    expect(
      findCommonFlow(published, [
        { ...build, gate: breaks },
        { ...build, number: 11, gate: holds },
      ])?.current,
    ).toBe(2)
  })

  // The build of the Decision is merged and its gate holds. M1 is a Metric
  // of the Goal that the Decision needs.
  const shipped = [{ ...build, gate: holds }]
  const goalMetric = {
    ...summary,
    id: 'M1',
    type: 'metric',
    title: 'Signup to paid',
    measure: null,
  } as const

  it('asks a built Decision with a Metric for the Insight of the reading', () => {
    const next = { kind: 'add', type: 'insight', label: 'Add Insight' }

    expect(
      findCommonFlow({ ...published, goalMetrics: [goalMetric] }, shipped),
    ).toEqual({
      name: 'Use to Insight',
      steps: ['Read'],
      current: 0,
      next,
    })
    // A Metric at the other end of a Joint of the Decision counts too.
    expect(
      findCommonFlow({ ...published, measured: [goalMetric] }, shipped)?.next,
    ).toEqual(next)
    expect(
      findCommonFlow(
        {
          ...published,
          goalMetrics: [{ ...goalMetric, workState: 'sunk' }],
        },
        shipped,
      )?.next,
    ).toEqual({ kind: 'add', type: 'metric', label: 'Add Metric' })
  })

  it('has no step left for a built Decision when an Insight needs it', () => {
    const flow = findCommonFlow(
      {
        ...published,
        goalMetrics: [goalMetric],
        neededBy: neededBy('flow', 'insight'),
      },
      shipped,
    )

    expect(flow).toMatchObject({ name: 'Use to Insight', current: 1 })
    expect(flow?.next).toBeUndefined()
  })

  it('counts a Part as built when the gate of its newest build holds', () => {
    expect(isBuilt([])).toBe(false)
    expect(isBuilt([{ ...build, gate: holds }])).toBe(true)
    expect(
      isBuilt([
        { ...build, number: 11, gate: holds },
        { ...build, gate: breaks },
      ]),
    ).toBe(false)
  })

  it('keeps a flag before the flow of a build', () => {
    expect(
      findCommonFlow(
        { ...published, trust: 'flagged', workState: 'to-check' },
        [build],
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
      name: 'Ask another Project',
      steps: ['Ask', 'Pick', 'Hand back'],
      current: 1,
      next: { kind: 'raise', label: 'Raise to Pattern', needsSource: true },
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
      name: 'Ask another Project',
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

// glue/D58: the step that moves the loop on, for each Part type, each Work
// state, and a Part that another Part needs or not.
describe('the next step of a Part in every state', () => {
  const types = [
    'insight',
    'goal',
    'decision',
    'guardrail',
    'entity',
    'flow',
    'metric',
  ] as const
  const awaited: PartSummary = { ...summary, id: 'G9', type: 'goal' }
  // The first Part of `neededBy`.
  const openNeeding = {
    kind: 'open',
    part: { id: 'X0', concept: 'glue' },
    label: 'Open X0 Show the video of the creator',
  }
  const addDecision = { kind: 'add', type: 'decision', label: 'Add Decision' }
  const openConcept = { kind: 'concept', label: 'Open Concept' }

  // A confirmed Insight: a Hunch and a Pattern raise their level first.
  function partOf(type: PartSummary['type'], changed: Partial<Part>): Part {
    return { ...published, type, evidenceLevel: 'confirmed', ...changed }
  }

  it.each([
    ['insight', null, addDecision],
    ['insight', 'decision', openNeeding],
    ['goal', null, addDecision],
    ['goal', 'decision', openNeeding],
    ['decision', null, { kind: 'add', type: 'flow', label: 'Add Flow' }],
    ['decision', 'flow', openConcept],
    ['guardrail', null, openConcept],
    ['guardrail', 'decision', openConcept],
    ['entity', null, openConcept],
    ['entity', 'flow', openConcept],
    ['flow', null, openConcept],
    ['flow', 'entity', openConcept],
    ['metric', null, { kind: 'add', type: 'insight', label: 'Add Insight' }],
    ['metric', 'insight', undefined],
  ] as const)('of a published %s that %s needs', (type, needing, next) => {
    const flow = findCommonFlow(
      partOf(type, { neededBy: needing ? neededBy(needing) : [] }),
    )

    expect(flow?.next).toEqual(next)
  })

  it.each(types)('of a %s with another Work state', (type) => {
    const next = (changed: Partial<Part>) =>
      findCommonFlow(partOf(type, changed))?.next
    const needed = neededBy('decision')

    for (const ends of [[], needed]) {
      expect(next({ workState: 'draft', neededBy: ends })).toEqual({
        kind: 'answer',
        answer: 'supersede',
      })
      expect(next({ workState: 'review', neededBy: ends })).toEqual({
        kind: 'answer',
        answer: 'supersede',
      })
      expect(next({ workState: 'to-check', neededBy: ends })).toEqual({
        kind: 'answer',
        answer: 'fine',
      })
      expect(
        next({ workState: 'waiting', waitsOn: awaited, neededBy: ends }),
      ).toEqual({
        kind: 'open',
        part: { id: 'G9', concept: 'glue' },
        label: 'Open G9 Show the video of the creator',
      })
      expect(next({ workState: 'sunk', neededBy: ends })).toBeUndefined()
    }
  })

  it('never is an answer that breaks the Part', () => {
    const states = ['to-check', 'waiting', 'draft', 'review', 'published']
    const nexts = types.flatMap((type) =>
      states.flatMap((workState) =>
        [[], neededBy('decision', 'flow', 'insight')].map(
          (ends) =>
            findCommonFlow(
              partOf(type, { workState, neededBy: ends } as Partial<Part>),
            )?.next,
        ),
      ),
    )

    expect(
      nexts.filter(
        (next) =>
          next?.kind === 'answer' &&
          (next.answer === 'not-ready' || next.answer === 'sink'),
      ),
    ).toEqual([])
    expect(nexts).toHaveLength(70)
  })

  it('reads a published Goal with a reading against its target', () => {
    const goal = partOf('goal', {
      neededBy: neededBy('decision'),
      measure: {
        measure: {
          kind: 'funnel',
          source: 'mock-analytics',
          steps: ['signed-up', 'paid'],
          target: 0.25,
          window_days: 7,
        },
        baseline: null,
        latestValue: 0.1,
        latestBreakdownValue: null,
        measuredAt: '2026-10-04T00:00:00.000Z',
        target: 0.25,
        onTarget: false,
      },
    })

    expect(findCommonFlow(goal)).toEqual({
      name: 'Use to Insight',
      steps: ['Read'],
      current: 0,
      next: { kind: 'add', type: 'insight', label: 'Add Insight' },
    })
    const [decision, insight] = neededBy('decision', 'insight')
    const read = findCommonFlow({ ...goal, neededBy: [decision, insight] })
    expect(read?.current).toBe(1)
    expect(read?.next).toBeUndefined()
    expect(
      findCommonFlow({
        ...goal,
        neededBy: [
          decision,
          { ...insight, part: { ...insight.part, workState: 'draft' } },
        ],
      }),
    ).toMatchObject({
      current: 1,
      next: {
        kind: 'open',
        part: { id: 'X1', concept: 'glue' },
        label: 'Open X1 Show the video of the creator',
      },
    })
  })

  // A published Decision needs work until the gate of a build of it holds.
  // `built` are the ids of the Decisions with such a build.
  it.each(['goal', 'insight'] as const)(
    'of a published %s opens the Part that needs work, not the first one',
    (type) => {
      const [first, second, third] = neededBy('decision', 'decision', 'flow')
      const part = partOf(type, {
        neededBy: [
          first,
          { ...second, part: { ...second.part, workState: 'review' } },
          third,
        ],
      })

      expect(findCommonFlow(part, [], undefined, [], ['X0'])?.next).toEqual({
        kind: 'open',
        part: { id: 'X1', concept: 'glue' },
        label: 'Open X1 Show the video of the creator',
      })
    },
  )

  it.each(['goal', 'insight'] as const)(
    'of a published %s has no step left when each Decision that needs it is published and built',
    (type) => {
      const part = partOf(type, { neededBy: neededBy('decision', 'decision') })
      const flow = findCommonFlow(part, [], undefined, [], ['X0', 'X1'])

      expect(flow?.current).toBe(3)
      expect(flow?.next).toBeUndefined()
      expect(
        findCommonFlow(part, [], undefined, [], ['X0'])?.next,
      ).toMatchObject({ kind: 'open', part: { id: 'X1' } })
    },
  )

  it('ends the flow of a Metric with its Insight', () => {
    expect(
      findCommonFlow(partOf('metric', { neededBy: neededBy('insight') }))
        ?.current,
    ).toBe(1)
  })

  it('has no step for a waiting Part that names no Part', () => {
    const flow = findCommonFlow(partOf('flow', { workState: 'waiting' }))

    expect(flow).toMatchObject({ name: 'React to a change', current: 1 })
    expect(flow?.next).toBeUndefined()
  })
})

describe('the common flow of a Concept', () => {
  const version = {
    version: 2,
    checksum: 'a81d03c5e7f9',
    signedBy: 'Ada',
    signedAt: '2026-10-04T08:30:00.000Z',
  }
  const unsigned: ContractState = {
    versions: [],
    ahead: false,
    blocking: [],
    emptySlots: [],
  }
  const signed: ContractState = { ...unsigned, versions: [version] }
  const named = { ...build, contract, decisions: [] }

  it('asks for the Part of the first empty slot that the Kind requires', () => {
    const brief: ContractState = {
      ...signed,
      emptySlots: [
        { type: 'metric', count: 0, minCount: 1 },
        { type: 'flow', count: 1, minCount: 2 },
      ],
    }

    expect(findConceptFlow(brief, [{ ...named, gate: holds }])).toEqual({
      name: 'Concept to build',
      steps: ['Fill slots', 'Sign', 'Build', 'Gate'],
      current: 0,
      next: { kind: 'add', type: 'metric', label: 'Add Metric' },
    })
  })

  it('asks for the sign-off of a Concept with no empty slot and no Contract Version', () => {
    expect(findConceptFlow(unsigned)).toMatchObject({
      current: 1,
      next: { kind: 'sign', label: 'Sign off' },
    })
  })

  it('asks for the sign-off of a Concept that is ahead of its Contract', () => {
    expect(
      findConceptFlow({ ...signed, ahead: true }, [{ ...named, gate: holds }]),
    ).toMatchObject({ current: 1, next: { kind: 'sign', label: 'Sign off' } })
  })

  it('opens the first Part that blocks the sign-off', () => {
    const blocking = [
      { ...summary, id: 'F5', concept: 'videos', trust: 'flagged' } as const,
      { ...summary, id: 'F6', trust: 'not-ready' } as const,
    ]

    expect(findConceptFlow({ ...unsigned, blocking })).toMatchObject({
      current: 1,
      next: {
        kind: 'open',
        part: { id: 'F5', concept: 'videos' },
        label: 'Open F5 Show the video of the creator',
      },
    })
  })

  it('shows the Contract Version to build from, until a build names it', () => {
    const next = { kind: 'version', version: 2, label: 'Open Version 2' }
    const old = { ...contract, version: 1 }

    expect(findConceptFlow(signed)).toMatchObject({ current: 2, next })
    expect(
      findConceptFlow(signed, [{ ...named, contract: old, gate: holds }]),
    ).toMatchObject({ current: 2, next })
  })

  it('shows the newest build that names the Contract Version, until its gate holds', () => {
    const next = {
      kind: 'link',
      href: 'https://github.com/timschoch/glue/pull/12',
      label: 'Open build 12',
    }

    expect(findConceptFlow(signed, [named])).toMatchObject({
      current: 3,
      next,
    })
    expect(
      findConceptFlow(signed, [
        { ...named, gate: breaks },
        { ...named, number: 11, gate: holds },
      ]),
    ).toMatchObject({ current: 3, next })
  })

  it('has no step left when the gate of the build holds', () => {
    const flow = findConceptFlow(signed, [{ ...named, gate: holds }])

    expect(flow.current).toBe(4)
    expect(flow.next).toBeUndefined()
  })

  // The build that shipped names D1 and D2 of the Concept. The Insight I7
  // needs D1.
  const decisions = [
    { ...summary, id: 'D1' },
    { ...summary, id: 'D2', title: 'Rank the bakers' },
  ]
  const insight = { ...summary, id: 'I7', type: 'insight' } as const
  const shipped = [{ ...named, gate: holds, decisions }]
  const joint = { id: 1, part: 'I7', needs: 'D1', twoWay: false, link: false }
  const concept = {
    parts: [...decisions, insight],
    linkedParts: [],
    joints: [joint],
  }

  it('opens the first Decision of the shipped build that no Insight needs', () => {
    expect(findConceptFlow(signed, shipped, concept)).toEqual({
      name: 'Use to Insight',
      steps: ['Read'],
      current: 0,
      next: {
        kind: 'open',
        part: { id: 'D2', concept: 'glue' },
        label: 'Open D2 Rank the bakers',
      },
    })
  })

  it('has no step left when an Insight needs each Decision of the shipped build', () => {
    const flow = findConceptFlow(signed, shipped, {
      ...concept,
      joints: [joint, { ...joint, id: 2, needs: 'D2' }],
    })

    expect(flow.current).toBe(4)
    expect(flow.next).toBeUndefined()
  })

  it('counts no sunk Insight, and no Decision with its home in another Concept', () => {
    const sunk = { ...insight, workState: 'sunk' } as const

    expect(
      findConceptFlow(signed, shipped, {
        ...concept,
        parts: [...decisions, sunk],
      }).next,
    ).toMatchObject({ kind: 'open', part: { id: 'D1' } })
    expect(
      findConceptFlow(signed, shipped, { ...concept, parts: [insight] }).next,
    ).toBeUndefined()
  })
})
