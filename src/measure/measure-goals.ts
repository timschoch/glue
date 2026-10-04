// The measure step of the cycle: read the measure of each Goal and of each
// Metric from its metric source, store the reading and write a draft
// Insight. A funnel gets one when it misses its target or moved. A mean gets
// one on each run, with its baseline.
import { z } from 'zod'

import type { ConceptDb } from '../db/client.ts'
import { addConceptRecord } from '../db/concept-records.ts'
import { goalMeasureSchema, isOnTarget } from '../db/goal-measure.ts'
import {
  findInsightIdBySource,
  listAcceptedDecisions,
  listGoalsWithMeasure,
} from '../db/legacy-records.ts'
import { setReading } from '../db/part-records.ts'
import type {
  FunnelMeasure,
  GoalMeasure,
  MeanMeasure,
} from '../db/goal-measure.ts'
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
  type: 'goal' | 'metric'
  baseline: number | null
  measure: TMeasure
}

const typeNames = { goal: 'Goal', metric: 'Metric' }

// How far a Goal or a Metric is, as a measure run stores it. A funnel has no
// baseline.
type Progress = {
  baseline: number | null
  latestValue: number
  latestBreakdownValue: string | null
}

type InsightDraft = { title: string; source: string; body: string }

// What a measure run read: the progress to store, and the Insight that the
// reading calls for. A window that says nothing gives none of the two.
type Measured = { progress?: Progress; draft?: InsightDraft }

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

// A URL-like reference to the query, with all that changes its result. It is
// also the key that keeps a second run over the same Goal, measure and window
// from writing the Insight again.
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
    ...(measure.kind === 'mean' && measure.baseline_value !== undefined
      ? [`baseline_value=${encodeURIComponent(measure.baseline_value)}`]
      : []),
  ].join('&')
  return `${measure.source}://${analyticsProject}/${measure.kind}?${query}`
}

async function formatAcceptedSection(
  db: ConceptDb,
  { goalId, goalRecordId }: MeasuredGoal,
) {
  const accepted = await listAcceptedDecisions(db, goalId)
  return [
    `## Decisions accepted for ${goalRecordId}`,
    accepted.length === 0
      ? 'None.'
      : accepted
          .map((decision) => `- ${decision.id} ${decision.title}`)
          .join('\n'),
  ].join('\n\n')
}

// The open Goals to measure, and the ones that cannot be measured with the reason.
async function listMeasuredGoals(
  db: ConceptDb,
  productSlug: string | undefined,
) {
  const rows = await listGoalsWithMeasure(db, productSlug)
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
        `the Product has no analytics project: pnpm concept project set ${row.productSlug} --analytics-project <key>`,
      )
    } else if (row.type === 'goal' || row.type === 'metric') {
      const { type } = row
      measured.push({ ...row, type, analyticsProject, measure: parsed.data })
    }
  }
  return { measured, skipped }
}

// The conversion of the funnel's last window, and the Insight that it calls
// for.
async function measureFunnelGoal(
  db: ConceptDb,
  source: MetricSource,
  now: Date,
  measured: MeasuredGoal<FunnelMeasure>,
): Promise<Measured> {
  const { goalRecordId, measure } = measured
  const lastWindow = windowBefore(now, measure.window_days)
  const reference = formatQueryReference(
    measured,
    [`steps=${measure.steps.join(',')}`],
    lastWindow,
  )

  const [last, before] = await Promise.all(
    [lastWindow, windowBefore(lastWindow.from, measure.window_days)].map(
      (window) => fetchWindowFunnel(source, measured, window),
    ),
  )
  if (last.counts[0] < MINIMUM_USERS) return {}
  const progress = {
    baseline: null,
    latestValue: conversion(last.counts),
    latestBreakdownValue: null,
  }
  const findings = listFindings(measure, last, before)
  if (findings.length === 0) return { progress }

  const { steps, window_days: days } = measure
  const title = [
    `${goalRecordId} ${steps[0]} → ${steps[steps.length - 1]}: ${percent.format(conversion(last.counts))}`,
    ...findings,
  ].join(', ')
  const body = [
    `${typeNames[measured.type]} ${goalRecordId}, target ${percent.format(measure.target)} from ${steps[0]} to ${steps[steps.length - 1]}. Query: ${reference}`,
    formatWindowSection(`Last ${days} days`, measure, last),
    formatWindowSection(`The ${days} days before`, measure, before),
    await formatAcceptedSection(db, measured),
  ].join('\n\n')
  return { progress, draft: { title, source: reference, body } }
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

// Names the breakdown value a mean belongs to in the Insight, for example
// ` for app_version eadfd12`. '' for a mean over all breakdown values.
function formatBreakdownValue(
  measure: MeanMeasure,
  value: string | null | undefined,
) {
  return value ? ` for ${measure.breakdown} ${value}` : ''
}

type ComparedMean = { breakdown: string | null; count: number; mean: number }

// The baseline and the latest mean a mean Goal compares, or null when one is
// missing. The stored baseline stays until a new measure clears it. With a
// baseline value: the first baseline is the mean of that breakdown value, the
// latest is the newest other breakdown value; events without one never count.
// Without: the first baseline and the latest are the mean over all values.
function findComparedMeans(
  { baseline_value: baselineValue }: MeanMeasure,
  results: MeanResult[],
  storedBaseline: number | null,
): { baseline: number; latest: ComparedMean } | null {
  if (baselineValue === undefined) {
    const { count, mean } = toTotalMean(results)
    if (mean === null) return null
    return {
      baseline: storedBaseline ?? mean,
      latest: { breakdown: null, count, mean },
    }
  }
  let baseline = storedBaseline
  let latest: (ComparedMean & { lastSeenAt: Date }) | undefined
  for (const { breakdown, count, mean, lastSeenAt } of results) {
    if (mean === null || lastSeenAt === null || breakdown === null) continue
    if (breakdown === baselineValue) {
      baseline ??= mean
    } else if (!latest || lastSeenAt > latest.lastSeenAt) {
      latest = { breakdown, count, mean, lastSeenAt }
    }
  }
  return latest && baseline !== null ? { baseline, latest } : null
}

// The mean of the last window with its Insight. None of the two when it has
// no mean to compare.
async function measureMeanGoal(
  db: ConceptDb,
  source: MetricSource,
  now: Date,
  measured: MeasuredGoal<MeanMeasure>,
): Promise<Measured> {
  const { analyticsProject, goalRecordId, measure } = measured
  const { event, property, where, breakdown } = measure
  const window = windowBefore(now, measure.window_days)
  const encode = encodeURIComponent
  const reference = formatQueryReference(
    measured,
    [
      `event=${encode(event)}`,
      `property=${encode(property)}`,
      ...(where
        ? [`where=${encode(where.property)}:${encode(String(where.value))}`]
        : []),
    ],
    window,
  )

  const results = await source.fetchMean({
    project: analyticsProject,
    event,
    property,
    ...window,
    ...(where && { where }),
    ...(breakdown && { breakdown }),
  })
  const compared = findComparedMeans(measure, results, measured.baseline)
  if (!compared) return {}

  const { baseline, latest } = compared
  const { mean, count } = latest
  const { target_change: targetChange, baseline_value: baselineValue } = measure
  const target = change.format(targetChange)
  const isReached = isOnTarget(measure, baseline, mean)
  const baselineText = `the baseline ${decimal.format(baseline)}${formatBreakdownValue(measure, baselineValue)}`
  const title = `${goalRecordId} mean of ${property}: ${decimal.format(mean)}${formatBreakdownValue(measure, latest.breakdown)} from ${count} values, ${change.format(mean - baseline)} from ${baselineText}, target ${target} ${isReached ? 'reached' : 'not reached'}`
  const filter = where ? `, where ${where.property} is ${where.value}` : ''
  const body = [
    `${typeNames[measured.type]} ${goalRecordId}, target ${target} from ${baselineText}: the mean of ${property} in ${event} events${filter}. Query: ${reference}`,
    formatWindowHeading(`Last ${measure.window_days} days`, window),
    formatMeanTable(breakdown, results, baseline),
    await formatAcceptedSection(db, measured),
  ].join('\n\n')
  const progress = {
    baseline,
    latestValue: mean,
    latestBreakdownValue: latest.breakdown,
  }
  return { progress, draft: { title, source: reference, body } }
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

type MeasureOptions = {
  db: ConceptDb
  source: MetricSource
  now: Date
  productSlug?: string
  dryRun?: boolean
}

// Writes the Insight unless one exists for the same query: from an earlier
// run, or from an overlapping run that wrote it first. A dry run writes
// nothing, its new Insight has no id.
async function addMeasuredInsight(
  { db, now, dryRun = false }: MeasureOptions,
  goal: MeasuredGoal,
  draft: InsightDraft,
): Promise<{ id: string | null; isDuplicate: boolean }> {
  const existingId = await findInsightIdBySource(
    db,
    goal.productId,
    draft.source,
  )
  if (existingId) return { id: existingId, isDuplicate: true }
  if (dryRun) return { id: null, isDuplicate: false }
  const fields = {
    title: draft.title,
    source: draft.source,
    date: formatDay(now),
    status: 'draft',
  }
  try {
    const id = await addConceptRecord(
      db,
      goal.productSlug,
      'insights',
      fields,
      draft.body,
    )
    return { id, isDuplicate: false }
  } catch (error) {
    const writtenId = await findInsightIdBySource(
      db,
      goal.productId,
      draft.source,
    )
    if (writtenId) return { id: writtenId, isDuplicate: true }
    throw error
  }
}

// Measures one Goal, stores its progress and writes its Insight. The progress
// does not depend on the Insight: a duplicate Insight is skipped with the
// reason, the progress is stored all the same. null when the measure calls for
// no Insight.
async function addGoalInsight(
  options: MeasureOptions,
  goal: MeasuredGoal,
): Promise<MeasuredInsight | SkippedGoal | null> {
  const { db, source, now, dryRun = false } = options
  const { progress, draft } = await measureGoal(db, source, now, goal)
  if (!dryRun && progress) {
    await setReading(db, goal.productSlug, goal.goalRecordId, {
      ...progress,
      measuredAt: now,
    })
  }
  if (!draft) return null
  const { id, isDuplicate } = await addMeasuredInsight(options, goal, draft)
  const names = { product: goal.productSlug, goal: goal.goalRecordId }
  return isDuplicate
    ? {
        ...names,
        reason: `Insight ${id} holds this measure of this window already`,
      }
    : { ...names, id, ...draft }
}

export async function measureGoals(
  options: MeasureOptions,
): Promise<{ insights: MeasuredInsight[]; skipped: SkippedGoal[] }> {
  const { measured, skipped } = await listMeasuredGoals(
    options.db,
    options.productSlug,
  )
  const written: MeasuredInsight[] = []
  // One failing Goal, for example a metric source error, stops no other Goal.
  for (const goal of measured) {
    try {
      const result = await addGoalInsight(options, goal)
      if (result && 'reason' in result) skipped.push(result)
      else if (result) written.push(result)
    } catch (error) {
      console.error(`measure ${goal.productSlug} ${goal.goalRecordId}`, error)
      const message = error instanceof Error ? error.message : String(error)
      skipped.push({
        product: goal.productSlug,
        goal: goal.goalRecordId,
        reason: `the measure run failed: ${message}`,
      })
    }
  }
  return { insights: written, skipped }
}
