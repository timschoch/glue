import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'

import * as schema from '../src/db/schema.ts'
import { createTestDatabase } from '../src/db/test-database.ts'
import { createFakeGithub } from '../src/test/github.ts'
import { TEAM_KEY, createFakeIntegrations } from '../src/test/integrations.ts'
import { runConcept } from './concept.ts'

describe('pnpm concept integration', () => {
  const { db } = createTestDatabase(schema)
  let printed: MockInstance<typeof console.log>
  let errors: MockInstance<typeof console.error>

  // The key comes from the environment: an argument stays in the history of
  // the shell.
  function run(args: string[], key: string | undefined = TEAM_KEY) {
    return runConcept(db, () => createFakeGithub().github, args, {
      getIntegrations: createFakeIntegrations,
      environment: { INTEGRATION_KEY: key },
    })
  }

  const add = (address = 'acme/shop') =>
    run([
      'integration',
      'add',
      '--tool',
      'github',
      '--address',
      address,
      '--project',
      'glue',
    ])

  const listPrinted = () => printed.mock.calls.map(([line]) => String(line))

  beforeEach(async () => {
    printed = vi.spyOn(console, 'log').mockImplementation(() => {})
    errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    await run(['project', 'add', 'glue'])
    printed.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('add reads the key from INTEGRATION_KEY, and list prints each Integration', async () => {
    await add()
    await add('acme/web')
    await run(['integration', 'pause', '2', '--project', 'glue'])
    printed.mockClear()

    await run(['integration', 'list', '--project', 'glue'])

    expect(listPrinted()).toEqual([
      '1  github  acme/shop  ...1234  active',
      '2  github  acme/web  ...1234  paused',
    ])
  })

  it('pause, start and remove take the id', async () => {
    await add()

    await run(['integration', 'pause', '1', '--project', 'glue'])
    await run(['integration', 'start', '1', '--project', 'glue'])
    await run(['integration', 'remove', '1', '--project', 'glue'])

    expect(listPrinted()).toEqual([
      '1  github  acme/shop  ...1234  active',
      '1  github  acme/shop  ...1234  paused',
      '1  github  acme/shop  ...1234  active',
    ])
    expect(await db.select().from(schema.integrations)).toEqual([])
  })

  it('add refuses with no key in the environment', async () => {
    await expect(
      run(
        ['integration', 'add', '--tool', 'github', '--address', 'acme/shop'],
        '',
      ),
    ).rejects.toThrow(
      'integration add needs --tool, --address and the key in INTEGRATION_KEY',
    )
  })

  it.each(['first', undefined])('pause refuses the id %s', async (id) => {
    await expect(
      run(['integration', 'pause', ...(id ? [id] : []), '--project', 'glue']),
    ).rejects.toThrow('integration pause needs the id of the Integration')
  })

  it('prints no key, open or encrypted', async () => {
    await add()
    await run(['integration', 'pause', '1', '--project', 'glue'])
    await run(['integration', 'start', '1', '--project', 'glue'])
    await run(['integration', 'list', '--project', 'glue'])
    const [{ encryptedKey }] = await db.select().from(schema.integrations)

    const output = [...printed.mock.calls, ...errors.mock.calls].join('\n')

    expect(output).toContain('...1234')
    expect(output).not.toContain(TEAM_KEY)
    expect(output).not.toContain(encryptedKey)
  })
})
