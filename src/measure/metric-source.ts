// A tool that holds a Product's usage data. Glue reads funnels from it to
// measure Goals. The mock analytics client is the first one; a PostHog client
// can take its place.
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

export type MetricSource = {
  fetchFunnel: (query: FunnelQuery) => Promise<FunnelResult[]>
}
