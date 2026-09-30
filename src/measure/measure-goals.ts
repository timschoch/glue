// The measure step of the cycle: read each Goal's measure from its metric
// source and write a draft Insight. A funnel Goal gets one when it misses its
// target or moved. A mean Goal gets one on each run, with its baseline.
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from '../db/client.ts'
import { addConceptRecord } from '../db/concept-records.ts'
import { goalMeasureSchema } from '../db/goal-measure.ts'
import type {
  FunnelMeasure,
  GoalMeasure,
  MeanMeasure,
} from '../db/goal-measure.ts'
import { decisions, goals, insights, products } from '../db/schema.ts'
import type { FunnelResult, MeanResult, MetricSource } from './metric-source.ts'

const DAY_MILLISECONDS = 86_400_000
const MOVE_SHARE = 0.2
// Fewer users in the first step of a window say nothing.
const MINIMUM_USERS = 30

const percent = new Intl.NumberFormat('en', {
  style: 'percent',
  maximumFractionDigits: 1,
})
const decimal = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
const change = new Intl.NumberFormat('en', {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})

export const measuredInsightSchema = z
  .object({
    product: z.string(),
    goal: z.string(),
    id: z
      .string()
      .nullable()
      .meta({ description: 'null in a dry run: nothing was written' }),
    title: z.string(),
    source: z.string(),
    body: z.string(),
  })
  .meta({ id: 'MeasuredInsight' })

export type MeasuredInsight = z.infer<typeof measuredInsightSchema>

export const skippedGoalSchema = z
  .object({ product: z.string(), goal: z.string(), reason: z.string() })
  .meta({ id: 'SkippedGoal' })

export type SkippedGoal = z.infer<typeof skippedGoalSchema>

type Window = { from: Date; to: Date }

// The funnel of one window: the results per breakdown value, and the users
// per step summed over them.
type WindowFunnel = {
  window: Window
  results: FunnelResult[]
  counts: number[]
}

type MeasuredGoal<TMeasure extends GoalMeasure = GoalMeasure> = {
  productId: number
  productSlug: string
  analyticsProject: string
  goalId: number
  goalRecordId: string
  baseline: number | null
  measure: TMeasure
}

// The Insight a measure run writes. `value` is the mean a mean Goal stores.
type MeasuredDraft = {
  title: string
  source: string
  body: string
  value?: number
}

function formatDay(date: Date) {
  return date.toISOString().slice(0, 10)
}

// The `days` days that end at the start of the day of `end`, in UTC.
function windowBefore(end: Date, days: number): Window {
  const to = new Date(formatDay(end))
  return { from: new Date(to.getTime() - days * DAY_MILLISECONDS), to }
}

async function fetchWindowFunnel(
  source: MetricSource,
  { analyticsProject, measure }: MeasuredGoal<FunnelMeasure>,
  window: Window,
): Promise<WindowFunnel> {
  const results = await source.fetchFunnel({
    project: analyticsProject,
    steps: measure.steps,
    ...window,
    ...(measure.breakdown && { breakdown: measure.breakdown }),
  })
  const counts = measure.steps.map((_step, index) =>
    results.reduce((sum, result) => sum + (result.steps[index]?.count ?? 0), 0),
  )
  return { window, results, counts }
}

function conversion(counts: number[]) {
  const first = counts[0]
  return first === 0 ? 0 : counts[counts.length - 1] / first
}

// A relative change of 20% or more counts as a move.
function hasMoved(before: number, after: number) {
  if (before === 0) return after > 0
  return Math.abs(after - before) / before >= MOVE_SHARE
}

// What the last window says about the Goal: below target, moved, or both.
function listFindings(
  measure: FunnelMeasure,
  last: WindowFunnel,
  before: WindowFunnel,
) {
  if (last.counts[0] < MINIMUM_USERS) return []
  const lastConversion = conversion(last.counts)
  const beforeConversion = conversion(before.counts)
  const findings: string[] = []
  if (lastConversion < measure.target) {
    findings.push(`below the target of ${percent.format(measure.target)}`)
  }
  if (
    before.counts[0] >= MINIMUM_USERS &&
    hasMoved(beforeConversion, lastConversion)
  ) {
    const direction = lastConversion > beforeConversion ? 'up' : 'down'
    findings.push(`${direction} from ${percent.format(beforeConversion)}`)
  }
  return findings
}

function formatRows(steps: string[], counts: number[], cells: string[]) {
  return steps.map((step, index) => {
    const before = counts[Math.max(index - 1, 0)]
    const share = before === 0 ? '–' : percent.format(counts[index] / before)
    const row = [...cells, step, counts[index], share]
    return `| ${row.join(' | ')} |`
  })
}

function formatTable(measure: FunnelMeasure, funnel: WindowFunnel) {
  const columns = ['Step', 'Users', 'Conversion from the step before']
  const { breakdown, steps } = measure
  if (!breakdown) {
    return [
      `| ${columns.join(' | ')} |`,
      `|${' --- |'.repeat(columns.length)}`,
      ...formatRows(steps, funnel.counts, []),
    ].join('\n')
  }
  const breakdownRows = funnel.results.flatMap((result) =>
    formatRows(
      steps,
      result.steps.map((step) => step.count),
      [result.breakdown ?? '(none)'],
    ),
  )
  return [
    `| ${[breakdown, ...columns].join(' | ')} |`,
    `|${' --- |'.repeat(columns.length + 1)}`,
    ...formatRows(steps, funnel.counts, ['all']),
    ...breakdownRows,
  ].join('\n')
}

function formatWindowHeading(heading: string, { from, to }: Window) {
  const lastDay = new Date(to.getTime() - DAY_MILLISECONDS)
  return `## ${heading}: ${formatDay(from)} to ${formatDay(lastDay)}`
}

function formatWindowSection(
  heading: string,
  measure: FunnelMeasure,
  funnel: WindowFunnel,
) {
  return [
    formatWindowHeading(heading, funnel.window),
    formatTable(measure, funnel),
  ].join('\n\n')
}

// A URL-like reference to the query. It is also the key that keeps a second
// run over the same Goal and window from writing the Insight again.
function formatQueryReference(
  { analyticsProject, goalRecordId, measure }: MeasuredGoal,
  fields: string[],
  window: Window,
) {
  const query = [
    `goal=${goalRecordId}`,
    ...fields,
    `from=${formatDay(window.from)}`,
    `to=${formatDay(window.to)}`,
    ...(measure.breakdown ? [`breakdown=${measure.breakdown}`] : []),
  ].join('&')
  return `${measure.source}://${analyticsProject}/${measure.kind}?${query}`
}

async function hasInsight(db: ConceptDb, productId: number, source: string) {
  const found = await db
    .select({ id: insights.id })
    .from(insights)
    .where(and(eq(insights.productId, productId), eq(insights.source, source)))
  return found.length > 0
}

async function formatAcceptedSection(
  db: ConceptDb,
  { goalId, goalRecordId }: MeasuredGoal,
) {
  const accepted = await db
    .select({ id: decisions.recordId, title: decisions.title })
    .from(decisions)
    .where(and(eq(decisions.goalId, goalId), eq(decisions.status, 'accepted')))
  accepted.sort(
    (left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1)),
  )
  return [
    `## Decisions accepted for ${goalRecordId}`,
    accepted.length === 0
      ? 'None.'
      : accepted
          .map((decision) => `- ${decision.id} ${decision.title}`)
          .join('\n'),
  ].join('\n\n')
}

// The Goals to measure, and the ones that cannot be measured with the reason.
async function listMeasuredGoals(
  db: ConceptDb,
  productSlug: string | undefined,
) {
  const rows = await db
    .select({
      productId: products.id,
      productSlug: products.slug,
      analyticsProject: products.analyticsProject,
      goalId: goals.id,
      goalRecordId: goals.recordId,
      baseline: goals.baseline,
      measure: goals.measure,
    })
    .from(goals)
    .innerJoin(products, eq(goals.productId, products.id))
    .where(
      and(
        isNotNull(goals.measure),
        productSlug === undefined ? undefined : eq(products.slug, productSlug),
      ),
    )
    .orderBy(goals.id)
  const measured: MeasuredGoal[] = []
  const skipped: SkippedGoal[] = []
  for (const { analyticsProject, measure, ...row } of rows) {
    const skip = (reason: string) =>
      skipped.push({
        product: row.productSlug,
        goal: row.goalRecordId,
        reason,
      })
    // A measure stored under an older schema no longer parses.
    const parsed = goalMeasureSchema.safeParse(measure)
    if (!parsed.success) {
      skip(`the measure is not valid: ${z.prettifyError(parsed.error)}`)
    } else if (!analyticsProject) {
      skip(
        `the Product has no analytics project: pnpm concept product set ${row.productSlug} --analytics-project <key>`,
      )
    } else {
      measured.push({ ...row, analyticsProject, measure: parsed.data })
    }
  }
  return { measured, skipped }
}

// The Insight the funnel Goal's last window calls for, or null when there is
// none or it is written already.
async function measureFunnelGoal(
  db: ConceptDb,
  source: MetricSource,
  now: Date,
  measured: MeasuredGoal<FunnelMeasure>,
): Promise<MeasuredDraft | null> {
  const { productId, goalRecordId, measure } = measured
  const lastWindow = windowBefore(now, measure.window_days)
  const reference = formatQueryReference(
    measured,
    [`steps=${measure.steps.join(',')}`],
    lastWindow,
  )
  if (await hasInsight(db, productId, reference)) return null

  const [last, before] = await Promise.all(
    [lastWindow, windowBefore(lastWindow.from, measure.window_days)].map(
      (window) => fetchWindowFunnel(source, measured, window),
    ),
  )
  const findings = listFindings(measure, last, before)
  if (findings.length === 0) return null

  const { steps, window_days: days } = measure
  const title = [
    `${goalRecordId} ${steps[0]} → ${steps[steps.length - 1]}: ${percent.format(conversion(last.counts))}`,
    ...findings,
  ].join(', ')
  const body = [
    `Goal ${goalRecordId}, target ${percent.format(measure.target)} from ${steps[0]} to ${steps[steps.length - 1]}. Query: ${reference}`,
    formatWindowSection(`Last ${days} days`, measure, last),
    formatWindowSection(`The ${days} days before`, measure, before),
    await formatAcceptedSection(db, measured),
  ].join('\n\n')
  return { title, source: reference, body }
}

// The mean over all breakdown values.
function toTotalMean(results: MeanResult[]) {
  const count = results.reduce((sum, result) => sum + result.count, 0)
  const sum = results.reduce(
    (total, result) => total + result.count * (result.mean ?? 0),
    0,
  )
  return { count, mean: count === 0 ? null : sum / count }
}

function formatMeanTable(
  breakdown: string | undefined,
  results: MeanResult[],
  baseline: number,
) {
  const columns = ['Values', 'Mean', 'Change from the baseline']
  const formatRow = (
    cells: (string | number)[],
    { count, mean }: Pick<MeanResult, 'count' | 'mean'>,
  ) => {
    const values =
      mean === null
        ? [count, '–', '–']
        : [count, decimal.format(mean), change.format(mean - baseline)]
    return `| ${[...cells, ...values].join(' | ')} |`
  }
  const total = toTotalMean(results)
  if (!breakdown) {
    return [
      `| ${columns.join(' | ')} |`,
      `|${' --- |'.repeat(columns.length)}`,
      formatRow([], total),
    ].join('\n')
  }
  return [
    `| ${[breakdown, ...columns].join(' | ')} |`,
    `|${' --- |'.repeat(columns.length + 1)}`,
    formatRow(['all'], total),
    ...results.map((result) =>
      formatRow([result.breakdown ?? '(none)'], result),
    ),
  ].join('\n')
}

// The Insight of the mean Goal's last window, or null when no event holds a
// number or it is written already. The first mean becomes the baseline.
async function measureMeanGoal(
  db: ConceptDb,
  source: MetricSource,
  now: Date,
  measured: MeasuredGoal<MeanMeasure>,
): Promise<MeasuredDraft | null> {
  const { productId, analyticsProject, goalRecordId, measure } = measured
  const { event, property, where, breakdown } = measure
  const window = windowBefore(now, measure.window_days)
  const reference = formatQueryReference(
    measured,
    [
      `event=${event}`,
      `property=${property}`,
      ...(where ? [`where=${where.property}:${where.value}`] : []),
    ],
    window,
  )
  if (await hasInsight(db, productId, reference)) return null

  const results = await source.fetchMean({
    project: analyticsProject,
    event,
    property,
    ...window,
    ...(where && { where }),
    ...(breakdown && { breakdown }),
  })
  const { count, mean } = toTotalMean(results)
  if (mean === null) return null

  const baseline = measured.baseline ?? mean
  const target = change.format(measure.target_change)
  const title = `${goalRecordId} mean of ${property}: ${decimal.format(mean)} from ${count} values, ${change.format(mean - baseline)} from the baseline ${decimal.format(baseline)}, target ${target}`
  const filter = where ? `, where ${where.property} is ${where.value}` : ''
  const body = [
    `Goal ${goalRecordId}, target ${target} from the baseline ${decimal.format(baseline)}: the mean of ${property} in ${event} events${filter}. Query: ${reference}`,
    formatWindowHeading(`Last ${measure.window_days} days`, window),
    formatMeanTable(breakdown, results, baseline),
    await formatAcceptedSection(db, measured),
  ].join('\n\n')
  return { title, source: reference, body, value: mean }
}

function measureGoal(
  db: ConceptDb,
  source: MetricSource,
  now: Date,
  goal: MeasuredGoal,
) {
  const { measure } = goal
  return measure.kind === 'mean'
    ? measureMeanGoal(db, source, now, { ...goal, measure })
    : measureFunnelGoal(db, source, now, { ...goal, measure })
}

// Stores the mean of the last run. The first one also becomes the baseline.
async function setLatestValue(
  db: ConceptDb,
  goalId: number,
  value: number,
  now: Date,
) {
  await db
    .update(goals)
    .set({
      baseline: sql`coalesce(${goals.baseline}, ${value}::double precision)`,
      latestValue: value,
      measuredAt: now,
    })
    .where(eq(goals.id, goalId))
}

// The new Insight's id, or null when an overlapping run wrote it first.
async function addMeasuredInsight(
  db: ConceptDb,
  goal: MeasuredGoal,
  draft: MeasuredDraft,
  now: Date,
) {
  const fields = {
    title: draft.title,
    source: draft.source,
    date: formatDay(now),
    status: 'draft',
  }
  try {
    return await addConceptRecord(
      db,
      goal.productSlug,
      'insights',
      fields,
      draft.body,
    )
  } catch (error) {
    if (await hasInsight(db, goal.productId, draft.source)) return null
    throw error
  }
}

export async function measureGoals(options: {
  db: ConceptDb
  source: MetricSource
  now: Date
  productSlug?: string
  dryRun?: boolean
}): Promise<{ insights: MeasuredInsight[]; skipped: SkippedGoal[] }> {
  const { db, source, now, productSlug, dryRun = false } = options
  const { measured, skipped } = await listMeasuredGoals(db, productSlug)
  const written: MeasuredInsight[] = []
  for (const goal of measured) {
    const measuredDraft = await measureGoal(db, source, now, goal)
    if (!measuredDraft) continue
    const { value, ...draft } = measuredDraft
    if (!dryRun && value !== undefined) {
      await setLatestValue(db, goal.goalId, value, now)
    }
    const id = dryRun ? null : await addMeasuredInsight(db, goal, draft, now)
    if (!dryRun && id === null) continue
    written.push({
      product: goal.productSlug,
      goal: goal.goalRecordId,
      id,
      ...draft,
    })
  }
  return { insights: written, skipped }
}
