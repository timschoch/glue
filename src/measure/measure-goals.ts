// The measure step of the cycle: read each Goal's funnel from its metric
// source and write a draft Insight when the Goal misses its target.
import { and, eq, isNotNull } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from '../db/client.ts'
import { addConceptRecord } from '../db/concept-records.ts'
import type { GoalMeasure } from '../db/goal-measure.ts'
import { decisions, goals, insights, products } from '../db/schema.ts'
import type { FunnelResult, MetricSource } from './metric-source.ts'

const DAY_MILLISECONDS = 86_400_000
const MOVE_SHARE = 0.2
// Fewer users in the first step of a window say nothing.
const MINIMUM_USERS = 30

const percent = new Intl.NumberFormat('en', {
  style: 'percent',
  maximumFractionDigits: 1,
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

type Window = { from: Date; to: Date }

// The funnel of one window: the results per breakdown value, and the users
// per step summed over them.
type WindowFunnel = {
  window: Window
  results: FunnelResult[]
  counts: number[]
}

type MeasuredGoal = {
  productId: number
  product: string
  goalId: number
  goal: string
  measure: GoalMeasure
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
  measure: GoalMeasure,
  window: Window,
): Promise<WindowFunnel> {
  const results = await source.fetchFunnel({
    project: measure.project,
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
  measure: GoalMeasure,
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

function formatTable(measure: GoalMeasure, funnel: WindowFunnel) {
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

function formatWindowSection(
  heading: string,
  measure: GoalMeasure,
  funnel: WindowFunnel,
) {
  const { from, to } = funnel.window
  const lastDay = new Date(to.getTime() - DAY_MILLISECONDS)
  return [
    `## ${heading}: ${formatDay(from)} to ${formatDay(lastDay)}`,
    formatTable(measure, funnel),
  ].join('\n\n')
}

// A URL-like reference to the query. It is also the key that keeps a second
// run over the same Goal and window from writing the Insight again.
function formatQueryReference(
  goal: string,
  measure: GoalMeasure,
  window: Window,
) {
  const query = [
    `goal=${goal}`,
    `steps=${measure.steps.join(',')}`,
    `from=${formatDay(window.from)}`,
    `to=${formatDay(window.to)}`,
    ...(measure.breakdown ? [`breakdown=${measure.breakdown}`] : []),
  ].join('&')
  return `${measure.source}://${measure.project}/funnel?${query}`
}

async function hasInsight(db: ConceptDb, productId: number, source: string) {
  const found = await db
    .select({ id: insights.id })
    .from(insights)
    .where(and(eq(insights.productId, productId), eq(insights.source, source)))
  return found.length > 0
}

async function listAcceptedDecisions(db: ConceptDb, goalId: number) {
  const accepted = await db
    .select({ id: decisions.recordId, title: decisions.title })
    .from(decisions)
    .where(and(eq(decisions.goalId, goalId), eq(decisions.status, 'accepted')))
  return accepted.sort(
    (left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1)),
  )
}

async function listMeasuredGoals(
  db: ConceptDb,
  productSlug: string | undefined,
): Promise<MeasuredGoal[]> {
  const rows = await db
    .select({
      productId: products.id,
      product: products.slug,
      goalId: goals.id,
      goal: goals.recordId,
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
  return rows.flatMap(({ measure, ...row }) =>
    measure ? [{ ...row, measure }] : [],
  )
}

// The Insight the Goal's last window calls for, or null when there is none
// or it is written already.
async function measureGoal(
  db: ConceptDb,
  source: MetricSource,
  now: Date,
  { productId, goalId, goal, measure }: MeasuredGoal,
) {
  const lastWindow = windowBefore(now, measure.window_days)
  const reference = formatQueryReference(goal, measure, lastWindow)
  if (await hasInsight(db, productId, reference)) return null

  const [last, before] = await Promise.all(
    [lastWindow, windowBefore(lastWindow.from, measure.window_days)].map(
      (window) => fetchWindowFunnel(source, measure, window),
    ),
  )
  const findings = listFindings(measure, last, before)
  if (findings.length === 0) return null

  const { steps, window_days: days } = measure
  const title = [
    `${goal} ${steps[0]} → ${steps[steps.length - 1]}: ${percent.format(conversion(last.counts))}`,
    ...findings,
  ].join(', ')
  const accepted = await listAcceptedDecisions(db, goalId)
  const body = [
    `Goal ${goal}, target ${percent.format(measure.target)} from ${steps[0]} to ${steps[steps.length - 1]}. Query: ${reference}`,
    formatWindowSection(`Last ${days} days`, measure, last),
    formatWindowSection(`The ${days} days before`, measure, before),
    `## Decisions accepted for ${goal}`,
    accepted.length === 0
      ? 'None.'
      : accepted
          .map((decision) => `- ${decision.id} ${decision.title}`)
          .join('\n'),
  ].join('\n\n')
  return { title, source: reference, body }
}

export async function measureGoals(options: {
  db: ConceptDb
  source: MetricSource
  now: Date
  productSlug?: string
  dryRun?: boolean
}): Promise<MeasuredInsight[]> {
  const { db, source, now, productSlug, dryRun = false } = options
  const written: MeasuredInsight[] = []
  for (const measured of await listMeasuredGoals(db, productSlug)) {
    const draft = await measureGoal(db, source, now, measured)
    if (!draft) continue
    const { product, goal } = measured
    const id = dryRun
      ? null
      : await addConceptRecord(
          db,
          product,
          'insights',
          {
            title: draft.title,
            source: draft.source,
            date: formatDay(now),
            status: 'draft',
          },
          draft.body,
        )
    written.push({ product, goal, id, ...draft })
  }
  return written
}
