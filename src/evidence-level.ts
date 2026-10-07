// When the Signals of a Hunch make it a Pattern (glue/D60). It imports
// nothing, so the server and the browser read it.

// A Signal of a Hunch: the name of its source, and the day that it came in,
// as 2026-10-02.
export type LevelSignal = { source: string; date: string }

// Several sources agree.
const PATTERN_SOURCES = 2
// The Signals of one source keep coming: on this many days, with this many
// days from the first one to the last one.
const PATTERN_DAYS = 3
const PATTERN_SPAN_DAYS = 7

const DAY_MILLISECONDS = 86_400_000

// Glue proposes Pattern for a Hunch with these Signals: they come from two
// sources or more, or one source gave them on three days or more, and the
// first and the last of these days are seven days or more apart.
export function canRaiseToPattern(signals: ReadonlyArray<LevelSignal>) {
  const sources = new Set(signals.map(({ source }) => source))
  if (sources.size >= PATTERN_SOURCES) return true
  // A day as yyyy-mm-dd sorts as text.
  const days = [...new Set(signals.map(({ date }) => date))].sort()
  if (days.length < PATTERN_DAYS) return false
  const span = Date.parse(days[days.length - 1]) - Date.parse(days[0])
  return span >= PATTERN_SPAN_DAYS * DAY_MILLISECONDS
}
