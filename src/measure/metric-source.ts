// A tool that holds a Product's usage data. Glue reads funnels and means from
// it to measure Goals. The mock analytics client is the first one; a PostHog
// client can take its place.
import type { PropertyFilter } from '../db/goal-measure.ts'

export type FunnelQuery = {
  project: string
  steps: string[]
  from: Date
  to: Date
  breakdown?: string
}

// The users who reached each step, in step order. Without a breakdown the
// source returns one result with `breakdown: null`.
export type FunnelResult = {
  breakdown: string | null
  steps: { event: string; count: number }[]
}

export type MeanQuery = {
  project: string
  event: string
  property: string
  from: Date
  to: Date
  where?: PropertyFilter
  breakdown?: string
}

// The mean of the property's number values, and how many values it read.
// `mean` is null when `count` is 0. Without a breakdown the source returns
// one result with `breakdown: null`.
export type MeanResult = {
  breakdown: string | null
  count: number
  mean: number | null
}

export type MetricSource = {
  fetchFunnel: (query: FunnelQuery) => Promise<FunnelResult[]>
  fetchMean: (query: MeanQuery) => Promise<MeanResult[]>
}
