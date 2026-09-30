import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findConcept, findRecord } from '../db/concept.ts'
import { addConceptRecord, setAnalyticsProject } from '../db/concept-records.ts'
import type { GoalMeasure } from '../db/goal-measure.ts'
import * as schema from '../db/schema.ts'
import { measureGoals } from './measure-goals.ts'
import type {
  FunnelQuery,
  FunnelResult,
  MetricSource,
} from './metric-source.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

const NOW = new Date('2026-09-30T10:00:00Z')
const LAST_WINDOW_END = new Date('2026-09-30T00:00:00Z')
const STEPS = ['signed-up', 'activated', 'paid']

const measure: GoalMeasure = {
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
  }
  return { source, queries }
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
