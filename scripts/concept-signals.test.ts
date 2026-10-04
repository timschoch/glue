import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setProductRepository } from '../src/db/concept-records.ts'
import { addProject } from '../src/db/part-records.ts'
import { findPart } from '../src/db/parts.ts'
import * as schema from '../src/db/schema.ts'
import { createFakeGithub, failingGithub } from '../src/test/github.ts'
import { runConcept } from './concept.ts'

describe('pnpm concept signals', () => {
  let client: PGlite
  let db: ReturnType<typeof drizzle<typeof schema>>
  let github = createFakeGithub().github
  let log: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  const signal = {
    url: 'https://github.com/timschoch/glue/issues/7',
    title: 'The list is slow',
    createdAt: '2026-10-02T08:00:00Z',
  }

  function run(...args: string[]) {
    return runConcept(db, () => github, args)
  }

  beforeEach(async () => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
    github = createFakeGithub([signal]).github
    client = new PGlite()
    db = drizzle(client, { schema })
    await migrate(db, { migrationsFolder: './drizzle' })
    await addProject(db, 'glue')
    await setProductRepository(db, 'glue', 'timschoch/glue')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await client.close()
  })

  it('lists the Signals of the Project glue', async () => {
    await run('signals')

    expect(log.mock.calls).toEqual([
      [`2026-10-02  ${signal.url}  The list is slow`],
    ])
  })

  it('adds the Insight that grows from the Signals, and lists it on them', async () => {
    await run('signals', 'insight', signal.url, '--title', 'Lists are slow')
    await run('signals', '--project', 'glue')

    expect(log.mock.calls).toEqual([
      ['I1'],
      [`2026-10-02  ${signal.url}  I1  The list is slow`],
    ])
    expect(await findPart(db, 'glue', 'I1')).toMatchObject({
      title: 'Lists are slow',
      evidenceLevel: 'hunch',
      signals: [{ url: signal.url, title: signal.title }],
    })
  })

  it('says why there are no Signals', async () => {
    github = failingGithub

    await run('signals')

    expect(log).not.toHaveBeenCalled()
    expect(error.mock.calls).toEqual([['no Signals: GitHub answered 503']])
  })
})
