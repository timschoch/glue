import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { listBuilds } from './builds.ts'
import { setProductRepository } from './concept-records.ts'
import { signContract } from './contracts.ts'
import {
  addConcept,
  addPart,
  addProject,
  answerPart,
  updatePart,
} from './part-records.ts'
import * as schema from './schema.ts'
import { createFakeGithub, failingGithub } from '../test/github.ts'
import type { PullRequest } from '../github/client.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

function toPullRequest(
  number: number,
  body: string,
  state: PullRequest['state'] = 'open',
): PullRequest {
  return {
    number,
    url: `https://github.com/timschoch/glue/pull/${number}`,
    title: `Change ${number}`,
    state,
    body,
  }
}

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})

// The Project glue has a repository and the Concept `videos` with the
// Decisions D1 and D2 and the Entity E1. The Project flexibeck has no
// repository.
beforeEach(async () => {
  await client.exec('truncate projects restart identity cascade')
  await addProject(db, 'glue')
  await setProductRepository(db, 'glue', 'timschoch/glue')
  await addProject(db, 'flexibeck')
  await addConcept(db, 'glue', { slug: 'videos', title: 'Technique videos' })
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
  await addPart(db, 'glue', {
    type: 'decision',
    concept: 'videos',
    title: 'Show the video of the creator',
    owner: 'Tim',
    date: '2026-10-02',
    status: 'accepted',
    needs: ['G1', 'I1'],
  })
  await addPart(db, 'glue', {
    type: 'decision',
    concept: 'videos',
    title: 'Play the video in a loop',
    owner: 'Tim',
    date: '2026-10-02',
    status: 'accepted',
    needs: ['G1', 'I1'],
  })
  await addPart(db, 'glue', {
    type: 'entity',
    concept: 'videos',
    title: 'Technique',
  })
  await answerPart(db, 'glue', 'E1', { answer: 'supersede' })
})

afterAll(async () => {
  await client.close()
})

describe('listBuilds', () => {
  it('reads the pull requests of the repository, each with the Decisions that it names', async () => {
    const fake = createFakeGithub(
      [],
      [
        toPullRequest(12, 'Fixes #3\n\nDecision: D1, D2'),
        toPullRequest(11, ''),
      ],
    )

    const found = await listBuilds(db, fake.github, 'glue')

    expect(fake.pullRequestsListed).toEqual(['timschoch/glue'])
    expect(found.reason).toBeNull()
    expect(found.builds).toEqual([
      {
        number: 12,
        url: 'https://github.com/timschoch/glue/pull/12',
        title: 'Change 12',
        state: 'open',
        decisions: [
          expect.objectContaining({ id: 'D1', concept: 'videos' }),
          expect.objectContaining({ id: 'D2', concept: 'videos' }),
        ],
        contract: null,
        stale: false,
      },
      expect.objectContaining({ number: 11, decisions: [], stale: false }),
    ])
  })

  it('marks a build stale when a Decision that it names is sunk', async () => {
    await answerPart(db, 'glue', 'D2', { answer: 'sink' })
    const { github } = createFakeGithub(
      [],
      [toPullRequest(12, 'Decision: D2'), toPullRequest(11, 'Decision: D1')],
    )

    const { builds } = await listBuilds(db, github, 'glue')

    expect(builds.map(({ number, stale }) => [number, stale])).toEqual([
      [12, true],
      [11, false],
    ])
  })

  it('marks a build stale when its Contract Version is not the newest one of the Concept', async () => {
    await signContract(db, 'glue', 'videos', 'Tim')
    await updatePart(db, 'glue', 'E1', { title: 'Baking technique' })
    await signContract(db, 'glue', 'videos', 'Tim')
    const { github } = createFakeGithub(
      [],
      [
        toPullRequest(12, 'Contract: videos@2'),
        toPullRequest(11, 'Contract: videos@1', 'merged'),
        toPullRequest(10, 'Contract: nope@1', 'merged'),
      ],
    )

    const { builds } = await listBuilds(db, github, 'glue')

    expect(builds.map(({ contract, stale }) => [contract, stale])).toEqual([
      [
        {
          concept: 'videos',
          title: 'Technique videos',
          version: 2,
          newestVersion: 2,
        },
        false,
      ],
      [
        {
          concept: 'videos',
          title: 'Technique videos',
          version: 1,
          newestVersion: 2,
        },
        true,
      ],
      [null, false],
    ])
  })

  it('keeps the open pull requests and the ten newest merged ones', async () => {
    const merged = Array.from({ length: 12 }, (_, index) =>
      toPullRequest(30 - index, '', 'merged'),
    )
    const { github } = createFakeGithub([], [...merged, toPullRequest(5, '')])

    const { builds } = await listBuilds(db, github, 'glue')

    expect(builds.map(({ number }) => number)).toEqual([
      30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 5,
    ])
  })

  it('gives no build and the reason for a Project without a repository', async () => {
    const fake = createFakeGithub([], [toPullRequest(12, '')])

    expect(await listBuilds(db, fake.github, 'flexibeck')).toEqual({
      builds: [],
      reason: 'The Project has no repository',
    })
    expect(fake.pullRequestsListed).toEqual([])
  })

  it('gives no build and the reason when GitHub fails', async () => {
    expect(await listBuilds(db, failingGithub, 'glue')).toEqual({
      builds: [],
      reason: 'GitHub answered 503',
    })
  })
})
