import { describe, expect, it } from 'vitest'

import { signalFilterSchema } from '../db/signal-filter-rule.ts'
import type { GithubClient } from '../github/client.ts'
import { sourceNames } from './signal-source-names.ts'
import { signalSources } from './signal-sources.ts'

// No adapter reads its tool before it lists Signals.
const mock = { url: undefined, readKey: undefined }
const tools = { github: {} as GithubClient, analytics: mock, social: mock }

describe('the Signal sources of Glue', () => {
  it('have each adapter under its own name', () => {
    const names = Object.entries(signalSources).map(([name, create]) => [
      name,
      create(tools).name,
    ])

    expect(names).toEqual([
      ['github', 'github'],
      ['support', 'support'],
      ['analytics', 'analytics'],
      ['social', 'social'],
      ['market', 'market'],
    ])
  })

  it('give the saved filter its sources: each adapter, and no other name', () => {
    const filter = { name: 'All', sources: sourceNames }

    expect(Object.keys(signalSources)).toEqual([...sourceNames])
    expect(signalFilterSchema.safeParse(filter).success).toBe(true)
    expect(
      signalFilterSchema.safeParse({ name: 'Fax', sources: ['fax'] }).success,
    ).toBe(false)
  })
})
