import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'

import { joinProject } from '../src/db/members.ts'
import * as schema from '../src/db/schema.ts'
import { createTestDatabase } from '../src/db/test-database.ts'
import { findToken } from '../src/db/tokens.ts'
import { createFakeGithub } from '../src/test/github.ts'
import { runConcept } from './concept.ts'

describe('pnpm concept token', () => {
  const { db } = createTestDatabase(schema)
  let printed: MockInstance<typeof console.log>

  function run(...args: string[]) {
    return runConcept(db, () => createFakeGithub().github, args)
  }

  function listPrinted() {
    return printed.mock.calls.map(([line]) => String(line))
  }

  // Ada is a member of the Project glue.
  beforeEach(async () => {
    printed = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await run('project', 'add', 'glue')
    await joinProject(db, 'glue', {
      id: 'user-ada',
      name: 'Ada',
      email: 'ada@example.com',
    })
    printed.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('create --member makes a token of the member, and prints it one time', async () => {
    await run(
      'token',
      'create',
      '--project',
      'glue',
      '--name',
      'laptop',
      '--member',
      'ada@example.com',
    )

    const [token, ...rest] = listPrinted()
    expect(rest).toEqual([])
    expect(await findToken(db, token)).toEqual({
      project: 'glue',
      member: { name: 'Ada', email: 'ada@example.com' },
    })
  })

  it('member add-agent makes a member with no account, and a token takes it', async () => {
    await run('member', 'add-agent', 'Orchestrator', '--project', 'glue')
    await run(
      'token',
      'create',
      '--project',
      'glue',
      '--name',
      'run',
      '--member',
      'orchestrator@agent.invalid',
    )

    const [agent, token] = listPrinted()
    expect(agent).toBe('Orchestrator  orchestrator@agent.invalid')
    expect(await findToken(db, token)).toEqual({
      project: 'glue',
      member: { name: 'Orchestrator', email: 'orchestrator@agent.invalid' },
    })
  })

  it('create refuses an address of no member', async () => {
    await expect(
      run(
        'token',
        'create',
        '--project',
        'glue',
        '--name',
        'laptop',
        '--member',
        'bo@example.com',
      ),
    ).rejects.toThrow('bo@example.com is no member of glue.')
    expect(listPrinted()).toEqual([])
  })

  it('list prints each token with its member', async () => {
    await run('token', 'create', '--project', 'glue', '--name', 'old')
    await run(
      'token',
      'create',
      '--project',
      'glue',
      '--name',
      'laptop',
      '--member',
      'ada@example.com',
    )
    printed.mockClear()

    await run('token', 'list')

    // The database sets the day of each token: the test leaves it out.
    const lines = listPrinted().map((line) => line.replace(/ {2}[\d-]+$/, ''))
    expect(lines).toEqual([
      '1  glue  old  -',
      '2  glue  laptop  ada@example.com',
    ])
  })
})
