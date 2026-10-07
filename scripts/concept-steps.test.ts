import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../src/db/schema.ts'
import { createTestDatabase } from '../src/db/test-database.ts'
import { createFakeGithub } from '../src/test/github.ts'
import { runConcept } from './concept.ts'

// What the CLI does itself with the steps of a Flow and the fields of an
// Entity: it reads the flag as JSON and prints the lists as JSON.
describe('pnpm concept with --steps and --fields', () => {
  const { db } = createTestDatabase(schema)
  const { github } = createFakeGithub()

  function run(...args: string[]) {
    return runConcept(db, () => github, args)
  }

  function logged(): string[] {
    return vi.mocked(console.log).mock.calls.map(([line]) => String(line))
  }

  // The Project glue has the Entity E1 with one field.
  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await run('project', 'add', 'glue')
    await run(
      'add',
      'entities',
      '--title',
      'Cart',
      '--fields',
      '[{"name":"total","meaning":"The sum to pay"}]',
    )
    vi.mocked(console.log).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('show prints the fields of an Entity', async () => {
    await run('show', 'E1')

    expect(logged()).toContain(
      'fields: [{"name":"total","meaning":"The sum to pay"}]',
    )
  })

  it('add takes the steps of a Flow, and show prints them', async () => {
    await run(
      'add',
      'flows',
      '--title',
      'Pay the cart',
      '--steps',
      '[{"text":"Open the cart","entity":"E1"},{"text":"Pay","entity":null}]',
    )
    await run('show', 'F1')

    expect(logged()).toEqual(
      expect.arrayContaining([
        'steps: [{"text":"Open the cart","entity":"E1"},{"text":"Pay","entity":null}]',
        'needs: E1 Cart',
      ]),
    )
  })

  it('set gives a Flow another list of steps', async () => {
    await run('add', 'flows', '--title', 'Pay the cart')

    await run('set', 'F1', '--steps', '[{"text":"Pay","entity":null}]')
    await run('show', 'F1')

    expect(logged()).toContain('steps: [{"text":"Pay","entity":null}]')
  })

  it('refuses steps that are no JSON', async () => {
    await expect(
      run('add', 'flows', '--title', 'Pay the cart', '--steps', 'Pay'),
    ).rejects.toThrow('"--steps" must be JSON')
  })

  it('show --version prints the steps of the Version', async () => {
    await run(
      'add',
      'flows',
      '--title',
      'Pay the cart',
      '--steps',
      '[{"text":"Pay","entity":null}]',
    )
    await run('answer', 'F1', 'supersede')
    await run('set', 'F1', '--steps', '[{"text":"Pay now","entity":null}]')
    vi.mocked(console.log).mockClear()

    await run('show', 'F1', '--version', '1')

    expect(logged()).toContain('steps: [{"text":"Pay","entity":null}]')
  })
})
