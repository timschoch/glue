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
  it('have the Trust of their Work state', () => {
    const found = Object.entries(stories).flatMap(([file, story]) =>
      findParts(story).map((part) => ({ file, part })),
    )
    const wrong = found
      .filter(
        ({ part }) =>
          !trusts[String(part.workState)].includes(String(part.trust)),
      )
      .map(({ file, part }) => ({
        file,
        id: part.id ?? part.recordId,
        trust: part.trust,
        workState: part.workState,
      }))

    // The stories that have Parts: a search that finds none proves nothing.
    expect([...new Set(found.map(({ file }) => file))]).toEqual([
      './card.stories.tsx',
      './frame.stories.tsx',
      './part-cards.stories.tsx',
      './record.stories.tsx',
    ])
    expect(wrong).toEqual([])
  })
})
