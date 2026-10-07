import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { joinProject } from '../src/db/members.ts'
import { setProductRepository } from '../src/db/projects.ts'
import { addPart, addProject, answerPart } from '../src/db/part-records.ts'
import * as schema from '../src/db/schema.ts'
import { createFakeGithub, failingGithub } from '../src/test/github.ts'
import { runConcept } from './concept.ts'

describe('pnpm concept builds', () => {
  let client: PGlite
  let db: ReturnType<typeof drizzle<typeof schema>>
  let github = createFakeGithub().github
  let log: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  function run(...args: string[]) {
    return runConcept(db, () => github, args)
  }

  beforeEach(async () => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
    github = createFakeGithub(
      [],
      [
        {
          number: 12,
          url: 'https://github.com/timschoch/glue/pull/12',
          title: 'Show the builds',
          state: 'open',
          body: 'Decision: D1',
        },
        {
          number: 11,
          url: 'https://github.com/timschoch/glue/pull/11',
          title: 'Loop the video',
          state: 'merged',
          body: 'Decision: D2',
        },
      ],
    ).github
    client = new PGlite()
    db = drizzle(client, { schema })
    await migrate(db, { migrationsFolder: './drizzle' })
    await addProject(db, 'glue')
    await joinProject(db, 'glue', {
      id: 'user-tim',
      name: 'Tim',
      email: 'tim@example.com',
    })
    await setProductRepository(db, 'glue', 'timschoch/glue')
    await addPart(db, 'glue', {
      type: 'goal',
      title: 'First bake feels easy',
      metric: 'ease',
      source: 'okr',
    })
    await addPart(db, 'glue', {
      type: 'insight',
      title: 'Bakers want step videos',
      source: 'interview',
      date: '2026-10-01',
    })
    for (const title of ['Show the builds', 'Play the video in a loop']) {
      await addPart(db, 'glue', {
        type: 'decision',
        title,
        owner: 'Tim',
        date: '2026-10-02',
        status: 'accepted',
        needs: ['G1', 'I1'],
      })
    }
    await answerPart(db, 'glue', 'D2', { answer: 'sink' })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await client.close()
  })

  it('lists the builds of the Project glue with what each one names and the stale mark', async () => {
    await run('builds')

    expect(log.mock.calls).toEqual([
      ['#12  open  D1  Show the builds'],
      ['#11  merged  D2  stale  Loop the video'],
    ])
  })

  it('says why there are no builds', async () => {
    github = failingGithub

    await run('builds', '--project', 'glue')

    expect(log).not.toHaveBeenCalled()
    expect(error.mock.calls).toEqual([['no builds: GitHub answered 503']])
  })
})
