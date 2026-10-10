import { describe, expect, it, vi } from 'vitest'

// The screen takes the rule of a saved filter. An adapter that the rule
// imports goes to the browser with it.
vi.mock('./signal-sources.ts', () => {
  throw new Error('the rule of a saved filter imports the adapters')
})

describe('the names of the Signal sources', () => {
  it('reach the rule of a saved filter with no adapter', async () => {
    const { signalFilterSchema } = await import('../db/signal-filter-rule.ts')
    const { sourceNames } = await import('./signal-source-names.ts')

    expect(
      signalFilterSchema.safeParse({ name: 'All', sources: sourceNames })
        .success,
    ).toBe(true)
  })
})
