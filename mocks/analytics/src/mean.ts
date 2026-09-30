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

export type MeanResult = {
  breakdown: string | null
  count: number
  mean: number | null
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
  return value === undefined || value === null ? null : String(value)
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
  events: { properties: Record<string, unknown> }[],
  query: Pick<MeanQuery, 'property' | 'where' | 'breakdown'>,
): MeanResult[] {
  const { property, where, breakdown } = query
  const sums = new Map<string | null, { count: number; sum: number }>()
  if (!breakdown) sums.set(null, { count: 0, sum: 0 })

  for (const { properties } of events) {
    if (where && !isFilterMatch(properties, where)) continue
    const number = parseNumber(properties[property])
    if (number === null) continue
    const key = breakdown ? toText(properties[breakdown]) : null
    const total = sums.get(key) ?? { count: 0, sum: 0 }
    total.count++
    total.sum += number
    sums.set(key, total)
  }

  return [...sums]
    .sort(([, left], [, right]) => right.count - left.count)
    .map(([key, { count, sum }]) => ({
      breakdown: key,
      count,
      mean: count === 0 ? null : sum / count,
    }))
}
