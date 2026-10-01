import { isFilterMatch, toText } from './mean.ts'
import type { MeanQuery } from './mean.ts'

export type ValuesQuery = MeanQuery & { limit: number }

export type ValueCount = {
  value: string
  count: number
}

export type ValuesResult = {
  breakdown: string | null
  values: ValueCount[]
}

// The values of the property per breakdown value, most frequent first, at
// most `limit` of them. Empty values are skipped. Breakdowns with the most
// values come first. Without a breakdown there is one result, with
// `breakdown: null`.
export function toValuesResults(
  events: { properties: Record<string, unknown> }[],
  query: Pick<ValuesQuery, 'property' | 'where' | 'breakdown' | 'limit'>,
): ValuesResult[] {
  const { property, where, breakdown, limit } = query
  const countsByBreakdown = new Map<string | null, Map<string, number>>()
  if (!breakdown) countsByBreakdown.set(null, new Map())

  for (const { properties } of events) {
    if (where && !isFilterMatch(properties, where)) continue
    const value = toText(properties[property])
    if (value === null || value.trim() === '') continue
    const key = breakdown ? toText(properties[breakdown]) : null
    const counts = countsByBreakdown.get(key) ?? new Map<string, number>()
    counts.set(value, (counts.get(value) ?? 0) + 1)
    countsByBreakdown.set(key, counts)
  }

  return [...countsByBreakdown]
    .map(([key, counts]) => ({
      breakdown: key,
      total: [...counts.values()].reduce((sum, count) => sum + count, 0),
      values: [...counts]
        .map(([value, count]) => ({ value, count }))
        .sort(
          (left, right) =>
            right.count - left.count || left.value.localeCompare(right.value),
        )
        .slice(0, limit),
    }))
    .sort((left, right) => right.total - left.total)
    .map(({ breakdown: key, values }) => ({ breakdown: key, values }))
}
