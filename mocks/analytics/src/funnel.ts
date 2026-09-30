export type FunnelQuery = {
  project: string
  steps: string[]
  from: Date
  to: Date
  breakdown?: string
  windowHours: number
}

export type FunnelEvent = {
  name: string
  distinctId: string
  timestamp: Date
  properties: Record<string, unknown>
}

export type FunnelStep = {
  event: string
  count: number
  conversion_from_previous: number
  conversion_from_first: number
}

export type FunnelResult = {
  breakdown: string | null
  steps: FunnelStep[]
}

const MILLISECONDS_PER_HOUR = 3_600_000

// Counts each person once, at the deepest step they reached in order within
// the window that opens at their first step. The breakdown value comes from
// that first step's event. `personIds` maps a merged distinct id to its
// person, see toPersonIds.
export function toFunnelResults(
  events: FunnelEvent[],
  query: Pick<FunnelQuery, 'steps' | 'breakdown' | 'windowHours'>,
  personIds: Map<string, string>,
): FunnelResult[] {
  const { steps, breakdown, windowHours } = query
  const windowLength = windowHours * MILLISECONDS_PER_HOUR

  const eventsByUser = new Map<string, FunnelEvent[]>()
  // Same timestamp: the earlier step in the funnel goes first.
  const sorted = [...events].sort(
    (left, right) =>
      left.timestamp.getTime() - right.timestamp.getTime() ||
      steps.indexOf(left.name) - steps.indexOf(right.name),
  )
  for (const event of sorted) {
    const personId = personIds.get(event.distinctId) ?? event.distinctId
    const userEvents = eventsByUser.get(personId) ?? []
    userEvents.push(event)
    eventsByUser.set(personId, userEvents)
  }

  const countsByBreakdown = new Map<string | null, number[]>()
  if (!breakdown)
    countsByBreakdown.set(
      null,
      steps.map(() => 0),
    )

  for (const userEvents of eventsByUser.values()) {
    let depth = 0
    let breakdownValue: string | null = null
    userEvents.forEach((start, startIndex) => {
      if (start.name !== steps[0]) return
      const deadline = start.timestamp.getTime() + windowLength
      let reached = 1
      for (
        let index = startIndex + 1;
        index < userEvents.length && reached < steps.length;
        index++
      ) {
        const next = userEvents[index]
        if (next.timestamp.getTime() > deadline) break
        if (next.name === steps[reached]) reached++
      }
      if (reached > depth) {
        depth = reached
        breakdownValue = breakdown
          ? toBreakdownValue(start.properties[breakdown])
          : null
      }
    })
    if (depth === 0) continue

    const counts = countsByBreakdown.get(breakdownValue) ?? steps.map(() => 0)
    for (let step = 0; step < depth; step++) counts[step]++
    countsByBreakdown.set(breakdownValue, counts)
  }

  return [...countsByBreakdown]
    .sort(([, left], [, right]) => right[0] - left[0])
    .map(([value, counts]) => ({
      breakdown: value,
      steps: steps.map((event, step) => ({
        event,
        count: counts[step],
        conversion_from_previous: toRatio(
          counts[step],
          counts[Math.max(step - 1, 0)],
        ),
        conversion_from_first: toRatio(counts[step], counts[0]),
      })),
    }))
}

function toBreakdownValue(value: unknown): string | null {
  return value === undefined || value === null ? null : String(value)
}

function toRatio(count: number, base: number) {
  return base === 0 ? 0 : count / base
}
