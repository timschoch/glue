export type PropertyFilter = {
  property: string
  value: string | number | boolean
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

// `lastSeenAt` is the time of the newest event that holds a number, like
// HogQL `max(timestamp)`. null when `count` is 0.
export type MeanResult = {
  breakdown: string | null
  count: number
  mean: number | null
  lastSeenAt: Date | null
}

// Like PostHog's HogQL avg(): a number string counts as its number, any
// other value that is not a finite number is skipped.
function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function toText(value: unknown): string | null {
  if (value === undefined || value === null) return null
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

// Compares as text, so the filter value 5 matches the property "5".
export function isFilterMatch(
  properties: Record<string, unknown>,
  filter: PropertyFilter,
): boolean {
  return toText(properties[filter.property]) === String(filter.value)
}

// The mean of the property per breakdown value, most answers first. Without
// a breakdown there is one result, with `breakdown: null`.
export function toMeanResults(
  events: { timestamp: Date; properties: Record<string, unknown> }[],
  query: Pick<MeanQuery, 'property' | 'where' | 'breakdown'>,
): MeanResult[] {
  const { property, where, breakdown } = query
  type Total = { count: number; sum: number; lastSeenAt: Date | null }
  const sums = new Map<string | null, Total>()
  if (!breakdown) sums.set(null, { count: 0, sum: 0, lastSeenAt: null })

  for (const { timestamp, properties } of events) {
    if (where && !isFilterMatch(properties, where)) continue
    const number = parseNumber(properties[property])
    if (number === null) continue
    const key = breakdown ? toText(properties[breakdown]) : null
    const total = sums.get(key) ?? { count: 0, sum: 0, lastSeenAt: null }
    total.count++
    total.sum += number
    if (!total.lastSeenAt || timestamp > total.lastSeenAt) {
      total.lastSeenAt = timestamp
    }
    sums.set(key, total)
  }

  return [...sums]
    .sort(([, left], [, right]) => right.count - left.count)
    .map(([key, { count, sum, lastSeenAt }]) => ({
      breakdown: key,
      count,
      mean: count === 0 ? null : sum / count,
      lastSeenAt,
    }))
}
