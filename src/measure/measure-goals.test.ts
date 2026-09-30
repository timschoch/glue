import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findConcept, findRecord } from '../db/concept.ts'
import {
  addConceptRecord,
  setAnalyticsProject,
  updateGoal,
} from '../db/concept-records.ts'
import type {
  FunnelMeasure,
  GoalMeasure,
  MeanMeasure,
} from '../db/goal-measure.ts'
import * as schema from '../db/schema.ts'
import { measureGoals } from './measure-goals.ts'
import type {
  FunnelQuery,
  FunnelResult,
  MeanQuery,
  MeanResult,
  MetricSource,
} from './metric-source.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

const NOW = new Date('2026-09-30T10:00:00Z')
const LAST_WINDOW_END = new Date('2026-09-30T00:00:00Z')
const STEPS = ['signed-up', 'activated', 'paid']

const measure: FunnelMeasure = {
  kind: 'funnel',
  source: 'mock-analytics',
  steps: STEPS,
  target: 0.25,
  window_days: 7,
}

beforeEach(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})

afterEach(async () => {
  await client.close()
})

async function addGoal(
  goalMeasure: GoalMeasure,
  product = 'flexibeck',
  analyticsProject: string | null = 'phc_demo',
) {
  await addConceptRecord(
    db,
    product,
    'goals',
    {
      title: 'More users pay',
      metric: 'signup to paid',
      source: 'okr',
      measure: goalMeasure,
    },
    '',
  )
  await setAnalyticsProject(db, product, analyticsProject)
}

function funnel(counts: number[], breakdown: string | null = null) {
  return {
    breakdown,
    steps: STEPS.map((event, index) => ({ event, count: counts[index] })),
  }
}

// Answers the last window with `current` and the window before with
// `previous`. Keeps every query it gets.
function createFakeSource(windows: {
  current: FunnelResult[]
  previous: FunnelResult[]
}) {
  const queries: FunnelQuery[] = []
  const source: MetricSource = {
    fetchFunnel: (query) => {
      queries.push(query)
      const isLast = query.to.getTime() === LAST_WINDOW_END.getTime()
      return Promise.resolve(isLast ? windows.current : windows.previous)
    },
    fetchMean: () => Promise.reject(new Error('a funnel Goal reads no mean')),
  }
  return { source, queries }
}

// Answers each mean query with the next of `answers`. Keeps every query.
function createFakeMeanSource(...answers: MeanResult[][]) {
  const queries: MeanQuery[] = []
  const source: MetricSource = {
    fetchFunnel: () => Promise.reject(new Error('a mean Goal reads no funnel')),
    fetchMean: (query) => {
      queries.push(query)
      return Promise.resolve(answers[queries.length - 1] ?? [])
    },
  }
  return { source, queries }
}

const meanMeasure: MeanMeasure = {
  kind: 'mean',
  source: 'mock-analytics',
  event: 'survey sent',
  property: '$survey_response',
  where: { property: '$survey_id', value: 'seq' },
  target_change: 1,
  window_days: 7,
}

async function runMeasure(
  source: MetricSource,
  options: { productSlug?: string; dryRun?: boolean } = {},
) {
  const { insights } = await measureGoals({ db, source, now: NOW, ...options })
  return insights
}

const belowTarget = {
  current: [funnel([100, 50, 10])],
  previous: [funnel([100, 50, 10])],
}

describe('measureGoals', () => {
  it('writes a draft Insight when the conversion is below target', async () => {
    await addGoal(measure)
    const { source, queries } = createFakeSource({
      current: [funnel([100, 50, 10])],
      previous: [funnel([100, 50, 10])],
    })

    const written = await runMeasure(source)

    expect(queries).toEqual([
      {
        project: 'phc_demo',
        steps: STEPS,
        from: new Date('2026-09-23T00:00:00Z'),
        to: new Date('2026-09-30T00:00:00Z'),
      },
      {
        project: 'phc_demo',
        steps: STEPS,
        from: new Date('2026-09-16T00:00:00Z'),
        to: new Date('2026-09-23T00:00:00Z'),
      },
    ])
    expect(written).toHaveLength(1)
    const insight = await findRecord(db, 'flexibeck', 'I1')
    expect(insight).toMatchObject({
      kind: 'insight',
      title: 'G1 signed-up → paid: 10%, below the target of 25%',
      date: '2026-09-30',
      status: 'draft',
      source:
        'mock-analytics://phc_demo/funnel?goal=G1&steps=signed-up,activated,paid&from=2026-09-23&to=2026-09-30',
    })
    expect(insight?.kind === 'insight' && insight.body).toContain(
      '| paid | 10 | 20% |',
    )
  })

  it('writes a draft Insight when the conversion moved by 20% or more', async () => {
    await addGoal({ ...measure, target: 0.05 })
    const { source } = createFakeSource({
      current: [funnel([100, 50, 10])],
      previous: [funnel([200, 100, 40])],
    })

    const [insight] = await runMeasure(source)

    expect(insight.title).toBe('G1 signed-up → paid: 10%, down from 20%')
    expect(insight.body).toContain('## Last 7 days: 2026-09-23 to 2026-09-29')
    expect(insight.body).toContain(
      '## The 7 days before: 2026-09-16 to 2026-09-22',
    )
    expect(insight.body).toContain('| paid | 40 | 40% |')
  })

  it('writes nothing when the conversion reaches the target and moved less than 20%', async () => {
    await addGoal({ ...measure, target: 0.05 })
    const { source } = createFakeSource({
      current: [funnel([100, 50, 10])],
      previous: [funnel([100, 50, 11])],
    })

    expect(await runMeasure(source)).toEqual([])
  })

  it('writes nothing with fewer than 30 users in the first step of the last window', async () => {
    await addGoal(measure)
    const { source } = createFakeSource({
      current: [funnel([29, 10, 1])],
      previous: [funnel([100, 50, 25])],
    })

    expect(await runMeasure(source)).toEqual([])
  })

  it('counts no move with fewer than 30 users in the first step of the window before', async () => {
    await addGoal({ ...measure, target: 0.05 })
    const { source } = createFakeSource({
      current: [funnel([100, 50, 10])],
      previous: [funnel([29, 10, 8])],
    })

    expect(await runMeasure(source)).toEqual([])
  })

  it('shows no conversion for a step with no users before it', async () => {
    await addGoal(measure)
    const { source } = createFakeSource({
      current: [funnel([100, 50, 10])],
      previous: [funnel([0, 0, 0])],
    })

    const [insight] = await runMeasure(source)

    expect(insight.body).toContain(
      '| signed-up | 0 | – |\n| activated | 0 | – |',
    )
  })

  it('writes nothing new on a second run over the same Goal and window', async () => {
    await addGoal(measure)
    const { source } = createFakeSource({
      current: [funnel([100, 50, 10])],
      previous: [funnel([100, 50, 10])],
    })

    await runMeasure(source)
    const second = await runMeasure(source)

    expect(second).toEqual([])
    const concept = await findConcept(db, 'flexibeck')
    expect(concept?.insights.map((insight) => insight.id)).toEqual(['I1'])
  })

  it('writes one Insight when two runs overlap', async () => {
    await addGoal(measure)
    const { source } = createFakeSource(belowTarget)

    const runs = await Promise.all([runMeasure(source), runMeasure(source)])

    expect(runs.flat()).toHaveLength(1)
    const concept = await findConcept(db, 'flexibeck')
    expect(concept?.insights.map((insight) => insight.id)).toEqual(['I1'])
  })

  it('keeps a measure source unique per Product, other sources may repeat', async () => {
    const addInsight = (source: string) =>
      addConceptRecord(db, 'flexibeck', 'insights', { title: 'x', source }, '')
    const measureSource = 'mock-analytics://phc_demo/funnel?goal=G1'

    await addInsight('Owner feedback')
    await addInsight('Owner feedback')
    await addInsight(measureSource)

    await expect(addInsight(measureSource)).rejects.toThrow()
  })

  it('skips a Goal of a Product without an analytics project', async () => {
    await addGoal(measure, 'flexibeck', null)
    const { source, queries } = createFakeSource(belowTarget)

    const result = await measureGoals({ db, source, now: NOW })

    expect(queries).toEqual([])
    expect(result).toEqual({
      insights: [],
      skipped: [
        {
          product: 'flexibeck',
          goal: 'G1',
          reason:
            'the Product has no analytics project: pnpm concept product set flexibeck --analytics-project <key>',
        },
      ],
    })
  })

  it('skips a Goal whose stored measure is no longer valid', async () => {
    await addGoal(measure)
    await client.query(`update goals set measure = '{"source": "posthog"}'`)
    const { source, queries } = createFakeSource(belowTarget)

    const { insights, skipped } = await measureGoals({ db, source, now: NOW })

    expect(queries).toEqual([])
    expect(insights).toEqual([])
    expect(skipped).toMatchObject([{ product: 'flexibeck', goal: 'G1' }])
    expect(skipped[0].reason).toMatch(/^the measure is not valid: /)
  })

  it('writes nothing in a dry run, but returns what it would write', async () => {
    await addGoal(measure)
    const { source } = createFakeSource({
      current: [funnel([100, 50, 10])],
      previous: [funnel([100, 50, 10])],
    })

    const [insight] = await runMeasure(source, { dryRun: true })

    expect(insight).toMatchObject({
      product: 'flexibeck',
      goal: 'G1',
      id: null,
    })
    const concept = await findConcept(db, 'flexibeck')
    expect(concept?.insights).toEqual([])
  })

  it('measures only the Product it is given', async () => {
    await addGoal(measure, 'flexibeck')
    await addGoal(measure, 'glue')
    const { source } = createFakeSource({
      current: [funnel([100, 50, 10])],
      previous: [funnel([100, 50, 10])],
    })

    const written = await runMeasure(source, { productSlug: 'glue' })

    expect(written.map((insight) => insight.product)).toEqual(['glue'])
  })

  it('adds a breakdown to each table when the Goal has one', async () => {
    await addGoal({ ...measure, breakdown: 'app_version' })
    const byVersion = [funnel([60, 30, 6], '1.2'), funnel([40, 20, 4], '1.3')]
    const { source, queries } = createFakeSource({
      current: byVersion,
      previous: byVersion,
    })

    const [insight] = await runMeasure(source)

    expect(queries[0].breakdown).toBe('app_version')
    expect(insight.title).toBe(
      'G1 signed-up → paid: 10%, below the target of 25%',
    )
    expect(insight.source).toContain('&breakdown=app_version')
    expect(insight.body).toContain(
      '| app_version | Step | Users | Conversion from the step before |',
    )
    expect(insight.body).toContain('| all | paid | 10 | 20% |')
    expect(insight.body).toContain('| 1.2 | signed-up | 60 | 100% |')
    expect(insight.body).toContain('| 1.3 | paid | 4 | 20% |')
  })

  it('lists the Decisions accepted for the Goal', async () => {
    await addGoal(measure)
    await addConceptRecord(
      db,
      'flexibeck',
      'facts',
      { title: 'Most users drop at activation', source: 'interviews' },
      '',
    )
    const decision = { owner: 'Owner', goal: 'G1', evidence: ['F1'] }
    await addConceptRecord(
      db,
      'flexibeck',
      'decisions',
      { ...decision, title: 'Shorter onboarding', status: 'accepted' },
      '',
    )
    await addConceptRecord(
      db,
      'flexibeck',
      'decisions',
      { ...decision, title: 'Free trial', status: 'proposed' },
      '',
    )
    const { source } = createFakeSource({
      current: [funnel([100, 50, 10])],
      previous: [funnel([100, 50, 10])],
    })

    const [insight] = await runMeasure(source)

    expect(insight.body).toContain(
      '## Decisions accepted for G1\n\n- D1 Shorter onboarding',
    )
    expect(insight.body).not.toContain('Free trial')
  })
})

describe('measureGoals with a mean measure', () => {
  it('stores the first mean as the baseline and writes a draft Insight', async () => {
    await addGoal(meanMeasure)
    const { source, queries } = createFakeMeanSource([
      { breakdown: null, count: 12, mean: 4 },
    ])

    const [written] = await runMeasure(source)

    expect(queries).toEqual([
      {
        project: 'phc_demo',
        event: 'survey sent',
        property: '$survey_response',
        where: { property: '$survey_id', value: 'seq' },
        from: new Date('2026-09-23T00:00:00Z'),
        to: new Date('2026-09-30T00:00:00Z'),
      },
    ])
    expect(await findRecord(db, 'flexibeck', written.id ?? '')).toMatchObject({
      title:
        'G1 mean of $survey_response: 4 from 12 values, 0 from the baseline 4, target +1 not reached',
      status: 'draft',
      source:
        'mock-analytics://phc_demo/mean?goal=G1&event=survey%20sent&property=%24survey_response&where=%24survey_id:seq&from=2026-09-23&to=2026-09-30',
    })
    expect(written.body).toContain(
      '| Values | Mean | Change from the baseline |\n| --- | --- | --- |\n| 12 | 4 | 0 |',
    )
    expect(await findRecord(db, 'flexibeck', 'G1')).toMatchObject({
      status: 'open',
      baseline: 4,
      latestValue: 4,
      measuredAt: NOW.toISOString(),
    })
  })

  it('keeps the baseline of the first run and stores the latest mean', async () => {
    await addGoal(meanMeasure)
    const { source } = createFakeMeanSource(
      [{ breakdown: null, count: 12, mean: 4 }],
      [{ breakdown: null, count: 20, mean: 5.25 }],
    )
    const nextWeek = new Date('2026-10-07T10:00:00Z')

    await runMeasure(source)
    const { insights } = await measureGoals({ db, source, now: nextWeek })

    expect(insights[0].title).toBe(
      'G1 mean of $survey_response: 5.25 from 20 values, +1.25 from the baseline 4, target +1 reached',
    )
    expect(await findRecord(db, 'flexibeck', 'G1')).toMatchObject({
      baseline: 4,
      latestValue: 5.25,
      measuredAt: nextWeek.toISOString(),
    })
  })

  it('reaches a target below the baseline only when the mean goes down far enough', async () => {
    await addGoal({ ...meanMeasure, target_change: -0.5 })
    const { source } = createFakeMeanSource(
      [{ breakdown: null, count: 12, mean: 4 }],
      [{ breakdown: null, count: 12, mean: 5 }],
      [{ breakdown: null, count: 12, mean: 3.5 }],
    )

    await runMeasure(source)
    const [up] = (
      await measureGoals({ db, source, now: new Date('2026-10-07T10:00:00Z') })
    ).insights
    const [down] = (
      await measureGoals({ db, source, now: new Date('2026-10-14T10:00:00Z') })
    ).insights

    expect(up.title).toMatch(/target -0\.5 not reached$/)
    expect(down.title).toMatch(/target -0\.5 reached$/)
  })

  it('starts a new baseline when the measure changes', async () => {
    await addGoal(meanMeasure)
    const { source } = createFakeMeanSource(
      [{ breakdown: null, count: 12, mean: 4 }],
      [{ breakdown: null, count: 9, mean: 2 }],
    )
    await runMeasure(source)

    await updateGoal(db, 'flexibeck', 'G1', {
      measure: { ...meanMeasure, property: 'rating' },
    })
    expect(await findRecord(db, 'flexibeck', 'G1')).toMatchObject({
      baseline: null,
      latestValue: null,
      measuredAt: null,
    })
    await measureGoals({ db, source, now: new Date('2026-10-07T10:00:00Z') })

    expect(await findRecord(db, 'flexibeck', 'G1')).toMatchObject({
      baseline: 2,
      latestValue: 2,
    })
  })

  it('keeps the baseline when only the status changes', async () => {
    await addGoal(meanMeasure)
    await runMeasure(
      createFakeMeanSource([{ breakdown: null, count: 12, mean: 4 }]).source,
    )

    await updateGoal(db, 'flexibeck', 'G1', { status: 'achieved' })

    expect(await findRecord(db, 'flexibeck', 'G1')).toMatchObject({
      status: 'achieved',
      baseline: 4,
      latestValue: 4,
    })
  })

  it('measures no achieved Goal', async () => {
    await addGoal(meanMeasure)
    await updateGoal(db, 'flexibeck', 'G1', { status: 'achieved' })
    const { source, queries } = createFakeMeanSource([
      { breakdown: null, count: 12, mean: 4 },
    ])

    expect(await measureGoals({ db, source, now: NOW })).toEqual({
      insights: [],
      skipped: [],
    })
    expect(queries).toEqual([])
  })

  it('shows the mean and its change for each breakdown value', async () => {
    await addGoal({ ...meanMeasure, breakdown: 'plan' })
    const { source, queries } = createFakeMeanSource([
      { breakdown: 'team', count: 8, mean: 5 },
      { breakdown: 'free', count: 4, mean: 2 },
    ])

    const [insight] = await runMeasure(source)

    expect(queries[0].breakdown).toBe('plan')
    expect(insight.source).toContain('&breakdown=plan')
    expect(insight.body).toContain(
      [
        '| plan | Values | Mean | Change from the baseline |',
        '| --- | --- | --- | --- |',
        '| all | 12 | 4 | 0 |',
        '| team | 8 | 5 | +1 |',
        '| free | 4 | 2 | -2 |',
      ].join('\n'),
    )
  })

  it('writes and stores nothing when no event holds a number', async () => {
    await addGoal(meanMeasure)
    const { source } = createFakeMeanSource([
      { breakdown: null, count: 0, mean: null },
    ])

    expect(await runMeasure(source)).toEqual([])
    expect(await findRecord(db, 'flexibeck', 'G1')).toMatchObject({
      baseline: null,
      latestValue: null,
    })
  })

  it('stores no baseline in a dry run', async () => {
    await addGoal(meanMeasure)
    const { source } = createFakeMeanSource([
      { breakdown: null, count: 12, mean: 4 },
    ])

    const [insight] = await runMeasure(source, { dryRun: true })

    expect(insight.id).toBeNull()
    expect(await findRecord(db, 'flexibeck', 'G1')).toMatchObject({
      baseline: null,
      latestValue: null,
    })
  })
})
