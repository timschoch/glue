// The rule of a saved filter of the Signals list (glue/D66). It runs before
// the groups are made, so the groups and their titles follow the filter.
// The module reads no database: the server and the screen use the same rule.
import { groupSignals } from './signal-groups.ts'
import type { SignalGroup } from './signal-groups.ts'
import type { Signal } from './signals.ts'

export type SignalFilterRule = {
  // The Signal holds each of these words, in its title or its text.
  mustHold: ReadonlyArray<string>
  // The Signal holds none of these words.
  mustNotHold: ReadonlyArray<string>
  // The names of the sources. None: each source passes.
  sources: ReadonlyArray<string>
}

function passes(signal: Signal, rule: SignalFilterRule) {
  const words = `${signal.title} ${signal.text}`.toLowerCase()
  const holds = (word: string) => words.includes(word.toLowerCase())
  return (
    rule.mustHold.every(holds) &&
    !rule.mustNotHold.some(holds) &&
    (rule.sources.length === 0 || rule.sources.includes(signal.source))
  )
}

// The Signals that pass each filter, in the order of the list, and their
// groups.
export function applySignalFilters(
  signals: ReadonlyArray<Signal>,
  filters: ReadonlyArray<SignalFilterRule>,
): { signals: Signal[]; groups: SignalGroup[] } {
  const passed = signals.filter((signal) =>
    filters.every((filter) => passes(signal, filter)),
  )
  return { signals: passed, groups: groupSignals(passed) }
}
