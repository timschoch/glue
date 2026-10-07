import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'

import { findConcept } from '../src/db/parts.ts'
import * as schema from '../src/db/schema.ts'
import { createTestDatabase } from '../src/db/test-database.ts'
import { createFakeGithub } from '../src/test/github.ts'
import { runConcept } from './concept.ts'

describe('pnpm concept kind', () => {
  const { db } = createTestDatabase(schema)
  let printed: MockInstance<typeof console.log>

  function run(...args: string[]) {
    return runConcept(db, () => createFakeGithub().github, args)
  }

  function listPrinted() {
    return printed.mock.calls.map(([line]) => String(line))
  }

  // The Project glue has the Kind Brief and the Kind PRD. A PRD requires a
  // Goal and two Flows, and can have a Metric.
  beforeEach(async () => {
    printed = vi.spyOn(console, 'log').mockImplementation(() => {})
    await run('project', 'add', 'glue')
    await run(
      'kind',
      'add',
      'prd',
      '--name',
      'PRD',
      '--required',
      'goal,flow:2',
      '--optional',
      'metric',
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('add prints the slug of the new Kind', () => {
    expect(listPrinted()).toEqual(['prd'])
  })

  it('list prints each Kind with its slots', async () => {
    printed.mockClear()

    await run('kind', 'list')

    expect(listPrinted()).toEqual([
      'brief  Brief',
      '  insight  required  1',
      '  goal  required  1',
      '  decision  required  1',
      '  metric  required  1',
      '  flow  required  1',
      '  entity  required  1',
      '  guardrail  required  1',
      'prd  PRD',
      '  goal  required  1',
      '  metric  optional  1',
      '  flow  required  2',
    ])
  })

  it('set gives a Kind a new name and new slots', async () => {
    await run('kind', 'set', 'prd', '--name', 'Product brief')
    await run('kind', 'set', 'prd', '--optional', 'entity')
    printed.mockClear()

    await run('kind', 'list')

    expect(listPrinted().slice(8)).toEqual([
      'prd  Product brief',
      '  entity  optional  1',
    ])
  })

  it('concept set gives a Concept another Kind, and an empty value takes it away', async () => {
    await run(
      'concept',
      'add',
      'videos',
      '--title',
      'Videos',
      '--kind',
      'brief',
    )

    await run('concept', 'set', 'videos', '--kind', 'prd')
    const changed = await findConcept(db, 'glue', 'videos')
    await run('concept', 'set', 'videos', '--kind', '')
    const cleared = await findConcept(db, 'glue', 'videos')

    expect(changed?.kind).toBe('prd')
    expect(cleared?.kind).toBeNull()
  })

  it('refuses a command that it does not have', async () => {
    await expect(run('kind', 'remove', 'prd')).rejects.toThrow(
      'unknown kind command "remove"',
    )
  })
})
