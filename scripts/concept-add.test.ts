import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { joinProject } from '../src/db/members.ts'
import { addPart, addProject } from '../src/db/part-records.ts'
import { findPart, listParts } from '../src/db/parts.ts'
import * as schema from '../src/db/schema.ts'
import { createTestDatabase } from '../src/db/test-database.ts'
import { createFakeGithub } from '../src/test/github.ts'
import { main, runConcept } from './concept.ts'

// The rules of `add` and of `set` on a Decision that the CLI checks itself,
// before the Part model sees the record.
describe('pnpm concept add and set', () => {
  const { db } = createTestDatabase(schema)
  let fake: ReturnType<typeof createFakeGithub>

  // A proposed Decision without its Goal and its evidence.
  const decisionFlags = [
    '--title',
    'Cache the record pages too',
    '--owner',
    'Ada',
    '--status',
    'proposed',
  ]

  function run(...args: string[]) {
    return runConcept(db, () => fake.github, args)
  }

  async function listIds(type: schema.PartType) {
    const parts = await listParts(db, 'glue', [type])
    return parts.map(({ id }) => id)
  }

  // The Project glue has the members tim and Ada, and G1, I1, R1, and D1
  // that is accepted.
  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fake = createFakeGithub()
    await addProject(db, 'glue')
    await joinProject(db, 'glue', {
      id: 'user-tim',
      name: 'tim',
      email: 'tim@example.com',
    })
    await joinProject(db, 'glue', {
      id: 'user-ada',
      name: 'Ada',
      email: 'ada@example.com',
    })
    await addPart(db, 'glue', {
      type: 'goal',
      title: 'Ship faster',
      metric: 'lead time',
      source: 'okr',
    })
    await addPart(db, 'glue', {
      type: 'insight',
      title: 'Users churn on slow loads',
      source: 'interview',
    })
    await addPart(db, 'glue', {
      type: 'guardrail',
      title: 'No query over 200ms',
      enforcedBy: 'none yet',
    })
    await addPart(db, 'glue', {
      type: 'decision',
      title: 'Cache the homepage',
      owner: 'tim',
      status: 'accepted',
      needs: ['G1', 'I1', 'R1'],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('names the flag that a new Guardrail lacks, and adds nothing', async () => {
    await expect(
      run('add', 'guardrails', '--title', 'No page over 1 MB'),
    ).rejects.toThrow('"enforced_by" is required')

    expect(await listIds('guardrail')).toEqual(['R1'])
  })

  it('refuses a new Decision without evidence', async () => {
    await expect(
      run('add', 'decisions', ...decisionFlags, '--goal', 'G1'),
    ).rejects.toThrow('"evidence" is required')

    expect(await listIds('decision')).toEqual(['D1'])
  })

  it('refuses a new superseded Decision without its successor', async () => {
    await expect(
      run(
        'add',
        'decisions',
        ...decisionFlags,
        '--goal',
        'G1',
        '--evidence',
        'I1',
        '--status',
        'superseded',
      ),
    ).rejects.toThrow('the status "superseded" and "supersededBy" go together')
  })

  it('refuses a Goal of a new Decision that is not a Goal', async () => {
    await expect(
      run(
        'add',
        'decisions',
        ...decisionFlags,
        '--goal',
        'R1',
        '--evidence',
        'I1',
      ),
    ).rejects.toThrow('goal "R1" not found')
  })

  it('refuses evidence of a new Decision that is not an Insight or a Guardrail', async () => {
    await expect(
      run(
        'add',
        'decisions',
        ...decisionFlags,
        '--goal',
        'G1',
        '--evidence',
        'I1,G1',
      ),
    ).rejects.toThrow('evidence "G1" not found')

    expect(await listIds('decision')).toEqual(['D1'])
  })

  it('refuses a Decision in a Project that does not exist, and does not add the Project', async () => {
    await expect(
      run(
        'add',
        'decisions',
        ...decisionFlags,
        '--goal',
        'G1',
        '--evidence',
        'I1',
        '--project',
        'nope',
      ),
    ).rejects.toThrow('product "nope" not found')

    const projects = await db
      .select({ slug: schema.projects.slug })
      .from(schema.projects)
    expect(projects).toEqual([{ slug: 'glue' }])
  })

  describe('set on a Decision', () => {
    // D2 is accepted too.
    beforeEach(async () => {
      await addPart(db, 'glue', {
        type: 'decision',
        title: 'Cache the record pages too',
        owner: 'Ada',
        status: 'accepted',
        needs: ['G1', 'I1'],
      })
    })

    it('supersedes the Decision by the successor of --superseded-by', async () => {
      await run('set', 'D1', '--status', 'superseded', '--superseded-by', 'D2')

      expect(await findPart(db, 'glue', 'D1')).toMatchObject({
        status: 'superseded',
        supersededBy: { id: 'D2' },
      })
    })

    it('refuses the status superseded without a successor, and keeps the status', async () => {
      await expect(run('set', 'D1', '--status', 'superseded')).rejects.toThrow(
        'the status "superseded" and "supersededBy" go together',
      )

      expect(await findPart(db, 'glue', 'D1')).toMatchObject({
        status: 'accepted',
      })
    })

    it('refuses a successor with a status other than superseded', async () => {
      await expect(
        run('set', 'D1', '--status', 'accepted', '--superseded-by', 'D2'),
      ).rejects.toThrow(
        'the status "superseded" and "supersededBy" go together',
      )

      expect(await findPart(db, 'glue', 'D1')).toMatchObject({
        status: 'accepted',
        supersededBy: null,
      })
    })

    it('gives the Decision the Goal of --goal and the body of --body', async () => {
      await addPart(db, 'glue', {
        type: 'goal',
        title: 'Break less',
        metric: 'failed releases',
        source: 'okr',
      })

      await run('set', 'D1', '--goal', 'G2', '--body', 'A click opens it.')

      const changed = await findPart(db, 'glue', 'D1')
      expect(changed).toMatchObject({
        status: 'accepted',
        body: 'A click opens it.',
      })
      expect(changed?.needs.map((end) => end.part.id)).toEqual([
        'I1',
        'R1',
        'G2',
      ])
    })

    it('gives the Decision the title of --title, and keeps its status', async () => {
      await run('set', 'D1', '--title', 'Cache the start page')

      expect(await findPart(db, 'glue', 'D1')).toMatchObject({
        title: 'Cache the start page',
        status: 'accepted',
      })
    })

    it('names --goal and --body in the help', async () => {
      await main(['--help'], undefined)

      const help = vi.mocked(console.log).mock.calls.flat().join('\n')
      expect(help).toContain(
        'pnpm concept set <id> <flags of the type> [--body <text>, or - for stdin]',
      )
      expect(help).toContain(
        'set on a Decision takes --status, --superseded-by, --title, --goal <id> and --body.',
      )
    })
  })
})
