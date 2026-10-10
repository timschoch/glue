import { describe, expect, it, vi } from 'vitest'

// The screen takes the rule of a saved filter. An adapter that the rule
// imports goes to the browser with it.
vi.mock('./signal-sources.ts', () => {
  throw new Error('the rule of a saved filter imports the adapters')
})

// A tool that only the list of the tools names.
vi.mock('./integration-tool-names.ts', () => ({
  toolNames: ['github', 'pager'],
}))

describe('the names of the Signal sources', () => {
  it('reach the rule of a saved filter for a tool of the list of the tools', async () => {
    const { signalFilterSchema } = await import('../db/signal-filter-rule.ts')

    expect(
      signalFilterSchema.safeParse({ name: 'Pages', sources: ['pager'] })
        .success,
    ).toBe(true)
    expect(
      signalFilterSchema.safeParse({ name: 'Faxes', sources: ['fax'] }).error
        ?.issues[0].message,
    ).toBe('"fax" is no source')
  })

  it('reach the rule of a saved filter with no adapter', async () => {
    const { signalFilterSchema } = await import('../db/signal-filter-rule.ts')
    const { sourceNames } = await import('./signal-source-names.ts')

    expect(
      signalFilterSchema.safeParse({ name: 'All', sources: sourceNames })
        .success,
    ).toBe(true)
  })
})
