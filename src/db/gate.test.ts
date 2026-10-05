import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { listBuilds } from './builds.ts'
import { signContract } from './contracts.ts'
import { validateBuild } from './gate.ts'
import {
  addConcept,
  addPart,
  addProject,
  answerPart,
  updatePart,
} from './part-records.ts'
import { addProjectReference, setProductRepository } from './projects.ts'
import * as schema from './schema.ts'
import { createFakeGithub } from '../test/github.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

const NOW = new Date('2026-10-05T08:00:00.000Z')

// The build 12 of the repository of the Project glue, with the body.
function toBuild(body: string, number = 12) {
  return { repository: 'timschoch/glue', number, body }
}

function toPullRequest(number: number, body: string) {
  return {
    number,
    url: `https://github.com/timschoch/glue/pull/${number}`,
    title: `Change ${number}`,
    state: 'open' as const,
    body,
  }
}

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})

// The Project glue has a repository and the Concept `videos` with the
// Decision D1 and the Entity E1. The Concept has the Contract Version 1.
beforeEach(async () => {
  await client.exec('truncate projects restart identity cascade')
  await addProject(db, 'glue')
  await setProductRepository(db, 'glue', 'timschoch/glue')
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
    type: 'entity',
    concept: 'videos',
    title: 'Technique',
  })
  await answerPart(db, 'glue', 'E1', { answer: 'supersede' })
  await signContract(db, 'glue', 'videos', 'Tim')
})

afterAll(async () => {
  await client.close()
})

describe('validateBuild', () => {
  it('holds for a build that names the newest Contract Version', async () => {
    const gate = await validateBuild(
      db,
      'glue',
      toBuild('Contract: videos@1'),
      NOW,
    )

    expect(gate).toEqual({
      result: 'holds',
      reasons: [],
      checkedAt: '2026-10-05T08:00:00.000Z',
    })
  })

  it('breaks for a build that names an older Contract Version', async () => {
    await updatePart(db, 'glue', 'E1', { title: 'Baking technique' })
    await signContract(db, 'glue', 'videos', 'Tim')

    const gate = await validateBuild(
      db,
      'glue',
      toBuild('Contract: videos@1'),
      NOW,
    )

    expect(gate.result).toBe('breaks')
    expect(gate.reasons).toEqual([
      'Contract "videos@1" is not the newest Version. Build with "videos@2": `pnpm concept contract show videos`.',
    ])
  })

  it('holds for a build that names an accepted Decision', async () => {
    const gate = await validateBuild(db, 'glue', toBuild('Decision: D1'), NOW)

    expect(gate.result).toBe('holds')
  })

  it('breaks for a build that names a sunk Decision', async () => {
    await answerPart(db, 'glue', 'D1', { answer: 'sink' })

    const gate = await validateBuild(db, 'glue', toBuild('Decision: D1'), NOW)

    expect(gate.result).toBe('breaks')
    expect(gate.reasons).toEqual([
      'Decision "D1" is sunk and has no successor. Cite an accepted Decision instead.',
    ])
  })

  it('breaks for a build that names no Decision and no Contract Version', async () => {
    const gate = await validateBuild(db, 'glue', toBuild('Fixes #3'), NOW)

    expect(gate.result).toBe('breaks')
    expect(gate.reasons).toEqual([
      'Name the Decision this change implements: "Decision: <id>", for example "Decision: D2". Or name the Contract Version it was built with: "Contract: <concept>@<version>".',
    ])
  })

  it('reads <project>/<id> as a Decision of a Project that the Project may reference', async () => {
    await addProject(db, 'flexibeck')
    await addProjectReference(db, 'flexibeck', 'glue')
    await setProductRepository(db, 'flexibeck', 'timschoch/flexibeck-next')
    const build = {
      repository: 'timschoch/flexibeck-next',
      number: 4,
      body: 'Decision: glue/D1',
    }
    const crossing = toBuild('Decision: flexibeck/D1')

    const referenced = await validateBuild(db, 'flexibeck', build, NOW)
    const refused = await validateBuild(db, 'glue', crossing, NOW)

    expect(referenced.result).toBe('holds')
    expect(refused.reasons).toEqual([
      'Decision "flexibeck/D1" does not exist. List them with `pnpm concept list decisions`.',
    ])
  })

  it('keeps the newest result with the build', async () => {
    const { github } = createFakeGithub(
      [],
      [toPullRequest(12, 'Decision: D1'), toPullRequest(11, '')],
    )
    const before = new Date('2026-10-04T08:00:00.000Z')
    await validateBuild(db, 'glue', toBuild('Fixes #3'), before)
    await validateBuild(db, 'glue', toBuild('Decision: D1'), NOW)

    const { builds } = await listBuilds(db, github, 'glue')

    expect(builds.map(({ number, gate }) => [number, gate])).toEqual([
      [
        12,
        {
          result: 'holds',
          reasons: [],
          checkedAt: '2026-10-05T08:00:00.000Z',
        },
      ],
      [11, null],
    ])
  })

  it('keeps the reasons of a build that breaks', async () => {
    const { github } = createFakeGithub([], [toPullRequest(12, 'Fixes #3')])
    await validateBuild(db, 'glue', toBuild('Decision: D9'), NOW)

    const { builds } = await listBuilds(db, github, 'glue')

    expect(builds[0].gate).toEqual({
      result: 'breaks',
      reasons: [
        'Decision "D9" does not exist. List them with `pnpm concept list decisions`.',
      ],
      checkedAt: '2026-10-05T08:00:00.000Z',
    })
  })

  it('refuses a build of a repository that is not the one of the Project', async () => {
    const build = { ...toBuild('Decision: D1'), repository: 'timschoch/other' }

    await expect(validateBuild(db, 'glue', build, NOW)).rejects.toThrow(
      'the builds of Project "glue" are in the repository "timschoch/glue"',
    )
  })
})
