// The rule of a saved filter of the Signals list (glue/D66). It runs before
// the groups are made, so the groups and their titles follow the filter.
// The module reads no database: the server and the screen use the same rule.
import { z } from 'zod'

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

// The names of the Signal sources of Glue: the adapters of
// src/signals/signal-sources.server.ts.
const sourceNames = ['github', 'support', 'analytics', 'social', 'market']

// The most characters of a name and of a word, and the most words of a list.
const MAX_NAME_LENGTH = 60
const MAX_WORD_LENGTH = 60
const MAX_WORDS = 20

const wordsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(MAX_WORD_LENGTH, {
        error: `A word has at most ${MAX_WORD_LENGTH} characters`,
      }),
  )
  .max(MAX_WORDS, { error: `A list has at most ${MAX_WORDS} words` })
  .default([])

const sources = z
  .array(
    z.string().check((context) => {
      if (!sourceNames.includes(context.value))
        context.issues.push({
          code: 'custom',
          message: `"${context.value}" is no source`,
          input: context.value,
        })
    }),
  )
  .default([])

export const signalFilterSchema = z
  .strictObject({
    name: z
      .string()
      .trim()
      .min(1)
      .max(MAX_NAME_LENGTH, {
        error: `A name has at most ${MAX_NAME_LENGTH} characters`,
      }),
    mustHold: wordsSchema.meta({
      description: 'The Signal holds each word, in its title or its text',
    }),
    mustNotHold: wordsSchema.meta({
      description: 'The Signal holds none of the words',
    }),
    sources: sources.meta({
      description: 'The names of the sources. None: each source passes',
    }),
  })
  .refine(
    ({ mustHold, mustNotHold, sources: named }) =>
      mustHold.length + mustNotHold.length + named.length > 0,
    { error: 'A filter needs a word or a source' },
  )

export type NewSignalFilter = z.input<typeof signalFilterSchema>

// The first reason of each field of the filter with a wrong value.
export function findSignalFilterProblems(
  filter: NewSignalFilter,
): Partial<Record<keyof NewSignalFilter, string>> {
  const parsed = signalFilterSchema.safeParse(filter)
  const problems: Partial<Record<PropertyKey, string>> = {}
  for (const { path, message } of parsed.error?.issues ?? []) {
    if (path.length > 0) problems[path[0]] ??= message
  }
  return problems
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
