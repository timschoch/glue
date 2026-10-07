import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { listBuilds } from './builds.ts'
import { setProductRepository } from './projects.ts'
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
  await answerPart(db, 'glue', 'G1', { answer: 'supersede' })
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
    needs: ['D1'],
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
        gate: null,
        stale: false,
      },
      expect.objectContaining({ number: 11, decisions: [], stale: false }),
    ])
  })

  it('reads <project>/<id> as a Decision of that Project only', async () => {
    const fake = createFakeGithub(
      [],
      [toPullRequest(12, 'Fixes #3\n\nDecision: glue/D1, flexibeck/D2')],
    )

    const found = await listBuilds(db, fake.github, 'glue')

    expect(found.builds[0].decisions.map(({ id }) => id)).toEqual(['D1'])
  })

  it('reads no bare id in a repository that another Project has too', async () => {
    await addProject(db, 'glue-build')
    await setProductRepository(db, 'glue-build', 'timschoch/glue')
    const { github } = createFakeGithub(
      [],
      [
        toPullRequest(12, 'Decision: D1'),
        toPullRequest(11, 'Decision: glue/D2'),
        toPullRequest(10, 'Decision: glue-build/D1'),
      ],
    )

    const { builds } = await listBuilds(db, github, 'glue')

    expect(
      builds.map(({ number, decisions }) => [
        number,
        decisions.map(({ id }) => id),
      ]),
    ).toEqual([
      [12, []],
      [11, ['D2']],
      [10, []],
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

  it('gives each build that names the Decision, also one older than the ten newest merged ones', async () => {
    const merged = Array.from({ length: 12 }, (_, index) =>
      toPullRequest(30 - index, 'Decision: D2', 'merged'),
    )
    const fake = createFakeGithub(
      [],
      [
        toPullRequest(31, 'Decision: D2, D1'),
        ...merged,
        toPullRequest(5, 'Decision: D1', 'merged'),
      ],
    )

    const { builds } = await listBuilds(db, fake.github, 'glue', {
      decision: 'D1',
    })

    expect(builds.map(({ number }) => number)).toEqual([31, 5])
    expect(fake.pullRequestsSearched).toEqual([
      { repository: 'timschoch/glue', text: 'D1' },
    ])
    expect(fake.pullRequestsListed).toEqual([])
  })

  it('gives no build that has the id of the Decision outside its "Decision:" line', async () => {
    const { github } = createFakeGithub(
      [],
      [
        toPullRequest(12, 'It follows D1.\n\nDecision: D2'),
        toPullRequest(11, 'Decision: D11'),
      ],
    )

    const { builds } = await listBuilds(db, github, 'glue', { decision: 'D1' })

    expect(builds).toEqual([])
  })

  it('searches GitHub only for a Decision that the Project has', async () => {
    const fake = createFakeGithub([], [toPullRequest(12, 'Decision: D1')])

    const found = await listBuilds(db, fake.github, 'glue', {
      decision: 'D1" repo:timschoch/flexibeck-next "',
    })

    expect(found).toEqual({ builds: [], reason: null })
    expect(fake.pullRequestsSearched).toEqual([])
  })

  it('gives each build that names a Contract Version of the Concept', async () => {
    await addConcept(db, 'glue', { slug: 'flows', title: 'Flows' })
    await addPart(db, 'glue', {
      type: 'entity',
      concept: 'flows',
      title: 'Step',
      needs: ['D1'],
    })
    await answerPart(db, 'glue', 'E2', { answer: 'supersede' })
    await signContract(db, 'glue', 'videos', 'Tim')
    await signContract(db, 'glue', 'flows', 'Tim')
    const merged = Array.from({ length: 12 }, (_, index) =>
      toPullRequest(30 - index, 'Contract: flows@1', 'merged'),
    )
    const fake = createFakeGithub(
      [],
      [...merged, toPullRequest(5, 'Contract: videos@1', 'merged')],
    )

    const { builds } = await listBuilds(db, fake.github, 'glue', {
      concept: 'videos',
    })

    expect(builds.map(({ number }) => number)).toEqual([5])
    expect(fake.pullRequestsSearched).toEqual([
      { repository: 'timschoch/glue', text: 'Contract' },
    ])
  })

  it('gives no build and the reason when the search of GitHub fails', async () => {
    expect(
      await listBuilds(db, failingGithub, 'glue', { decision: 'D1' }),
    ).toEqual({ builds: [], reason: 'GitHub answered 503' })
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
