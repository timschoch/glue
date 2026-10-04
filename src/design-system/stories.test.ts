// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

// The Trust that goes with each Work state: docs/concept.md, section 6.
const trusts: Record<string, ReadonlyArray<string>> = {
  'to-check': ['flagged'],
  waiting: ['flagged'],
  draft: ['not-ready', 'flagged'],
  review: ['not-ready'],
  published: ['solid'],
  sunk: ['wrong'],
}

const stories = import.meta.glob<Record<string, unknown>>('./*.stories.tsx', {
  eager: true,
})

// Each record below a value that has a Trust and a Work state.
function findParts(value: unknown): Array<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  const below = Object.values(record).flatMap(findParts)
  return typeof record.trust === 'string' &&
    typeof record.workState === 'string'
    ? [record, ...below]
    : below
}

describe('the Parts of the stories', () => {
  it.each(Object.keys(stories))(
    'have the Trust of their Work state in %s',
    (file) => {
      const wrong = findParts(stories[file])
        .filter(
          ({ trust, workState }) =>
            !trusts[String(workState)].includes(String(trust)),
        )
        .map(({ id, recordId, trust, workState }) => ({
          id: id ?? recordId,
          trust,
          workState,
        }))

      expect(wrong).toEqual([])
    },
  )
})
