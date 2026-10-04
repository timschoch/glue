import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { eq } from 'drizzle-orm'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import type { GoalMeasure } from './goal-measure.ts'
import {
  addConcept,
  addJoint,
  addPart,
  addProject,
  parseNewPart,
  parsePartChange,
  removeJoint,
  removePart,
  setIssueUrl,
  setReading,
  supersedeDecision,
  updatePart,
} from './part-records.ts'
import { InvalidRecordError, ProductNotFoundError } from './record-errors.ts'
import * as schema from './schema.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})

// Each test starts with empty tables and with row ids from 1. That is
// faster than a new database for each test.
beforeEach(async () => {
  await client.exec('truncate projects restart identity cascade')
})

afterAll(async () => {
  await client.close()
})

// No read side exists yet, so the tests read the tables.
function listConcepts() {
  return db
    .select({
      projectId: schema.concepts.projectId,
      parentId: schema.concepts.parentId,
      slug: schema.concepts.slug,
      title: schema.concepts.title,
      kind: schema.concepts.kind,
    })
    .from(schema.concepts)
    .orderBy(schema.concepts.id)
}

// The Part of the record id in the Project 1, without its row ids.
async function showPart(recordId: string) {
  const [{ id: _id, projectId: _projectId, ...part }] = await db
    .select()
    .from(schema.parts)
    .where(eq(schema.parts.recordId, recordId))
    .orderBy(schema.parts.projectId)
  return part
}

function listJoints() {
  return db.select().from(schema.joints).orderBy(schema.joints.id)
}

const goal = {
  type: 'goal',
  title: 'Ship faster',
  metric: 'lead time',
  source: 'okr',
} as const
const insight = {
  type: 'insight',
  title: 'Users churn on slow loads',
  date: '2026-01-01',
  source: 'interview',
} as const
const guardrail = {
  type: 'guardrail',
  title: 'UI is Carbon',
  enforcedBy: 'lint',
} as const
const decision = {
  type: 'decision' as const,
  title: 'Cache the homepage',
  date: '2026-01-02',
  owner: 'tim',
  status: 'accepted' as const,
  needs: ['G1', 'I1'],
}
const funnel: GoalMeasure = {
  kind: 'funnel',
  source: 'mock-analytics',
  steps: ['signed-up', 'paid'],
  target: 0.2,
  window_days: 7,
}
const mean: GoalMeasure = {
  kind: 'mean',
  source: 'mock-analytics',
  event: 'survey sent',
  property: 'answer',
  target_change: 1,
  window_days: 7,
}
const reading = {
  baseline: 4.5,
  latestValue: 5.25,
  latestBreakdownValue: '1.2.0',
  measuredAt: new Date('2026-10-03T12:00:00Z'),
}

describe('addProject', () => {
  it('adds the Project with a root Concept that takes its slug', async () => {
    await addProject(db, 'glue')

    expect(
      await db
        .select({ slug: schema.projects.slug, name: schema.projects.name })
        .from(schema.projects),
    ).toEqual([{ slug: 'glue', name: 'glue' }])
    expect(await listConcepts()).toEqual([
      { projectId: 1, parentId: null, slug: 'glue', title: 'glue', kind: null },
    ])
  })

  it('gives back the row id of the Project, new or not', async () => {
    expect(await addProject(db, 'glue')).toBe(1)
    expect(await addProject(db, 'flexibeck')).toBe(2)
    expect(await addProject(db, 'glue')).toBe(1)
  })

  it('keeps one Project and one root Concept when it runs twice', async () => {
    await addProject(db, 'glue')
    await addProject(db, 'glue')

    expect(await db.select().from(schema.projects)).toHaveLength(1)
    expect(await listConcepts()).toHaveLength(1)
  })

  it('gives a Project from before the Part model its root Concept', async () => {
    await db.insert(schema.projects).values({ slug: 'glue', name: 'Glue' })

    await addProject(db, 'glue')

    expect(await listConcepts()).toEqual([
      { projectId: 1, parentId: null, slug: 'glue', title: 'Glue', kind: null },
    ])
  })
})

describe('addConcept', () => {
  beforeEach(() => addProject(db, 'glue'))

  it('nests a Concept in the root Concept when no parent is given', async () => {
    const slug = await addConcept(db, 'glue', {
      slug: 'part-model',
      title: 'Part model',
    })

    expect(slug).toBe('part-model')
    expect((await listConcepts())[1]).toEqual({
      projectId: 1,
      parentId: 1,
      slug: 'part-model',
      title: 'Part model',
      kind: null,
    })
  })

  it('nests a Concept of a Kind in the parent Concept', async () => {
    await addConcept(db, 'glue', { slug: 'part-model', title: 'Part model' })

    await addConcept(db, 'glue', {
      slug: 'joints',
      title: 'Joints',
      kind: 'brief',
      parent: 'part-model',
    })

    expect((await listConcepts())[2]).toEqual({
      projectId: 1,
      parentId: 2,
      slug: 'joints',
      title: 'Joints',
      kind: 'brief',
    })
  })

  it('refuses a Concept in a Project that does not exist', async () => {
    await expect(
      addConcept(db, 'flexibeck', { slug: 'videos', title: 'Videos' }),
    ).rejects.toThrow(ProductNotFoundError)
  })

  it('refuses a parent Concept of another Project', async () => {
    await addProject(db, 'flexibeck')
    await addConcept(db, 'flexibeck', { slug: 'videos', title: 'Videos' })

    await expect(
      addConcept(db, 'glue', {
        slug: 'demos',
        title: 'Demos',
        parent: 'videos',
      }),
    ).rejects.toThrow(new InvalidRecordError('concept "videos" not found'))
  })

  it('refuses a slug that the Project has already', async () => {
    await addConcept(db, 'glue', { slug: 'part-model', title: 'Part model' })

    await expect(
      addConcept(db, 'glue', { slug: 'part-model', title: 'Second' }),
    ).rejects.toThrow(
      new InvalidRecordError('concept "part-model" exists already'),
    )
    await expect(
      addConcept(db, 'glue', { slug: 'glue', title: 'Second root' }),
    ).rejects.toThrow(new InvalidRecordError('concept "glue" exists already'))
  })

  it('refuses a slug that is not lowercase words joined by hyphens', async () => {
    await expect(
      addConcept(db, 'glue', { slug: 'Part Model', title: 'Part model' }),
    ).rejects.toThrow(InvalidRecordError)
  })

  it('refuses a Concept without a title', async () => {
    await expect(
      addConcept(db, 'glue', { slug: 'part-model', title: ' ' }),
    ).rejects.toThrow(InvalidRecordError)
  })

  it('refuses a Kind that Glue does not have', async () => {
    await expect(
      addConcept(db, 'glue', {
        slug: 'part-model',
        title: 'Part model',
        // @ts-expect-error a Kind that the code does not have
        kind: 'prd',
      }),
    ).rejects.toThrow(InvalidRecordError)
  })
})

describe('addPart', () => {
  // The Concept 1 is the root of glue, the Concept 2 is `part-model` in it.
  beforeEach(async () => {
    await addProject(db, 'glue')
    await addConcept(db, 'glue', { slug: 'part-model', title: 'Part model' })
  })

  it('adds a Part of each type with the letter of the type in its id', async () => {
    const ids = [
      await addPart(db, 'glue', goal),
      await addPart(db, 'glue', insight),
      await addPart(db, 'glue', guardrail),
      await addPart(db, 'glue', decision),
      await addPart(db, 'glue', { type: 'entity', title: 'Technique' }),
      await addPart(db, 'glue', { type: 'flow', title: 'Accept a plan' }),
      await addPart(db, 'glue', { type: 'metric', title: 'Lead time' }),
    ]

    expect(ids).toEqual(['G1', 'I1', 'R1', 'D1', 'E1', 'F1', 'M1'])
    expect(await showPart('R1')).toEqual({
      conceptId: 1,
      type: 'guardrail',
      recordId: 'R1',
      title: 'UI is Carbon',
      body: '',
      owner: null,
      status: null,
      date: null,
      source: null,
      metric: null,
      enforcedBy: 'lint',
      issueUrl: null,
      evidenceLevel: null,
      supersededById: null,
    })
    expect(await showPart('D1')).toMatchObject({
      type: 'decision',
      title: 'Cache the homepage',
      date: '2026-01-02',
      owner: 'tim',
      status: 'accepted',
    })
  })

  it('puts the Part in the home Concept of the slug', async () => {
    await addPart(db, 'glue', {
      ...insight,
      concept: 'part-model',
      body: 'Five of six said so.',
      owner: 'tim',
      evidenceLevel: 'pattern',
    })

    expect(await showPart('I1')).toMatchObject({
      conceptId: 2,
      body: 'Five of six said so.',
      owner: 'tim',
      evidenceLevel: 'pattern',
    })
  })

  it('opens a new Goal, and dates an Insight and a Decision today', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-03T12:00Z') })
    try {
      await addPart(db, 'glue', goal)
      await addPart(db, 'glue', { ...insight, date: undefined })
      await addPart(db, 'glue', { ...decision, date: undefined })
    } finally {
      vi.useRealTimers()
    }

    expect(await showPart('G1')).toMatchObject({ status: 'open', date: null })
    expect(await showPart('I1')).toMatchObject({
      status: null,
      date: '2026-10-03',
    })
    expect(await showPart('D1')).toMatchObject({ date: '2026-10-03' })
  })

  it('glues the Part to the Parts it needs, in their order', async () => {
    await addPart(db, 'glue', goal)
    await addPart(db, 'glue', insight)
    await addPart(db, 'glue', guardrail)

    await addPart(db, 'glue', { ...decision, needs: ['R1', 'G1', 'I1', 'R1'] })

    // The Parts 1 to 4 are G1, I1, R1, D1.
    expect(await listJoints()).toEqual([
      { id: 1, partId: 4, neededPartId: 3, twoWay: false },
      { id: 2, partId: 4, neededPartId: 1, twoWay: false },
      { id: 3, partId: 4, neededPartId: 2, twoWay: false },
    ])
  })

  it('counts the ids of each type and of each Project on their own', async () => {
    await addProject(db, 'flexibeck')

    expect(await addPart(db, 'glue', goal)).toBe('G1')
    expect(await addPart(db, 'glue', goal)).toBe('G2')
    expect(await addPart(db, 'glue', guardrail)).toBe('R1')
    expect(await addPart(db, 'flexibeck', goal)).toBe('G1')
  })

  it('never uses the number of a deleted Part again', async () => {
    await addPart(db, 'glue', goal)
    await addPart(db, 'glue', goal)
    await db.delete(schema.parts).where(eq(schema.parts.recordId, 'G2'))

    expect(await addPart(db, 'glue', goal)).toBe('G3')
  })

  it('counts on from the highest id when the type has no counter', async () => {
    await db.insert(schema.parts).values({
      projectId: 1,
      conceptId: 1,
      type: 'guardrail',
      recordId: 'R12',
      title: 'Budget is 0',
      enforcedBy: 'review',
    })

    expect(await addPart(db, 'glue', guardrail)).toBe('R13')
  })

  it('counts on from the highest id when the counter is below it', async () => {
    await addPart(db, 'glue', guardrail)
    await db.insert(schema.parts).values({
      projectId: 1,
      conceptId: 1,
      type: 'guardrail',
      recordId: 'R12',
      title: 'Budget is 0',
      enforcedBy: 'review',
    })

    expect(await addPart(db, 'glue', guardrail)).toBe('R13')
    expect(await addPart(db, 'glue', guardrail)).toBe('R14')
  })

  it('adds a Goal with how Glue measures it', async () => {
    await addPart(db, 'glue', { ...goal, measure: funnel })

    expect(await db.select().from(schema.measures)).toMatchObject([
      { partId: 1, measure: funnel, baseline: null },
    ])
  })

  it('refuses a second Insight of the same measure query', async () => {
    const measured = { ...insight, source: 'mock-analytics://glue/funnel?a=1' }
    await addPart(db, 'glue', measured)

    await expect(addPart(db, 'glue', measured)).rejects.toThrow(
      new InvalidRecordError(
        'an Insight with the source "mock-analytics://glue/funnel?a=1" exists already',
      ),
    )
    expect(await addPart(db, 'glue', insight)).toBe('I2')
    expect(await addPart(db, 'glue', insight)).toBe('I3')
  })

  it('adds a Decision that is superseded, with its successor', async () => {
    await addPart(db, 'glue', goal)
    await addPart(db, 'glue', insight)
    await addPart(db, 'glue', decision)

    await addPart(db, 'glue', {
      ...decision,
      status: 'superseded',
      supersededBy: 'D1',
    })

    // The Part 3 is D1.
    expect(await showPart('D2')).toMatchObject({
      status: 'superseded',
      supersededById: 3,
    })
  })

  it('refuses a superseded Decision with a successor that is not accepted', async () => {
    await addPart(db, 'glue', goal)
    await addPart(db, 'glue', insight)
    await addPart(db, 'glue', { ...decision, status: 'proposed' })

    await expect(
      addPart(db, 'glue', {
        ...decision,
        status: 'superseded',
        supersededBy: 'D1',
      }),
    ).rejects.toThrow(new InvalidRecordError('"D1" is not accepted'))
    await expect(
      addPart(db, 'glue', { ...decision, supersededBy: 'D1' }),
    ).rejects.toThrow(
      new InvalidRecordError(
        'the status "superseded" and "supersededBy" go together',
      ),
    )
  })

  it('refuses a Decision that needs two Goals', async () => {
    await addPart(db, 'glue', goal)
    await addPart(db, 'glue', goal)
    await addPart(db, 'glue', insight)

    await expect(
      addPart(db, 'glue', { ...decision, needs: ['G1', 'G2', 'I1'] }),
    ).rejects.toThrow(new InvalidRecordError('a Decision needs one Goal'))
  })

  it('supersedes a Decision with the Decision it adds', async () => {
    await addPart(db, 'glue', goal)
    await addPart(db, 'glue', insight)
    await addPart(db, 'glue', decision)

    const id = await addPart(db, 'glue', { ...decision, supersedes: 'D1' })

    // The Parts 3 and 4 are D1 and D2.
    expect(id).toBe('D2')
    expect(await showPart('D1')).toMatchObject({
      status: 'superseded',
      supersededById: 4,
    })
    expect(await showPart('D2')).toMatchObject({
      status: 'accepted',
      supersededById: null,
    })
  })

  it('refuses to supersede a Decision that is superseded already, and uses no number', async () => {
    await addPart(db, 'glue', goal)
    await addPart(db, 'glue', insight)
    await addPart(db, 'glue', decision)
    await addPart(db, 'glue', { ...decision, supersedes: 'D1' })

    await expect(
      addPart(db, 'glue', { ...decision, supersedes: 'D1' }),
    ).rejects.toThrow(new InvalidRecordError('"D1" is superseded already'))
    expect(await addPart(db, 'glue', decision)).toBe('D3')
  })

  it('refuses to supersede with a Decision that is not accepted', async () => {
    await addPart(db, 'glue', goal)
    await addPart(db, 'glue', insight)
    await addPart(db, 'glue', decision)

    await expect(
      addPart(db, 'glue', {
        ...decision,
        status: 'proposed',
        supersedes: 'D1',
      }),
    ).rejects.toThrow(
      new InvalidRecordError('"supersedes" needs the status "accepted"'),
    )
  })

  it('refuses to supersede a Part that is not a Decision', async () => {
    await addPart(db, 'glue', goal)
    await addPart(db, 'glue', insight)

    await expect(
      addPart(db, 'glue', { ...decision, supersedes: 'G1' }),
    ).rejects.toThrow(new InvalidRecordError('"G1" is not a Decision'))
    await expect(
      addPart(db, 'glue', { ...guardrail, supersedes: 'G1' }),
    ).rejects.toThrow(new InvalidRecordError('only a Decision supersedes'))
  })

  it('refuses a Decision that needs no Goal', async () => {
    await addPart(db, 'glue', insight)

    await expect(
      addPart(db, 'glue', { ...decision, needs: ['I1'] }),
    ).rejects.toThrow(new InvalidRecordError('a Decision needs a Goal'))
  })

  it('refuses a Decision that needs no evidence', async () => {
    await addPart(db, 'glue', goal)

    await expect(
      addPart(db, 'glue', { ...decision, needs: ['G1'] }),
    ).rejects.toThrow(
      new InvalidRecordError(
        'a Decision needs evidence: an Insight or a Guardrail',
      ),
    )
  })

  it('refuses to need a Part that the Project does not have', async () => {
    await addProject(db, 'flexibeck')
    await addPart(db, 'flexibeck', goal)

    await expect(
      addPart(db, 'glue', { ...guardrail, needs: ['G1'] }),
    ).rejects.toThrow(new InvalidRecordError('goal "G1" not found'))
  })

  it('refuses a Part in a Project that does not exist', async () => {
    await expect(addPart(db, 'flexibeck', goal)).rejects.toThrow(
      ProductNotFoundError,
    )
  })

  it('refuses a home Concept that the Project does not have', async () => {
    await expect(
      addPart(db, 'glue', { ...goal, concept: 'videos' }),
    ).rejects.toThrow(new InvalidRecordError('concept "videos" not found'))
  })

  it('refuses a type that is not a Part type', async () => {
    await expect(
      // @ts-expect-error Fact is no longer a type
      addPart(db, 'glue', { type: 'fact', title: 'CI takes ten minutes' }),
    ).rejects.toThrow(InvalidRecordError)
  })

  it('refuses a Part without a field that its type must have', async () => {
    await expect(
      // @ts-expect-error a Goal has a metric
      addPart(db, 'glue', {
        type: 'goal',
        title: 'Ship faster',
        source: 'okr',
      }),
    ).rejects.toThrow(InvalidRecordError)
    await expect(
      addPart(db, 'glue', { ...guardrail, enforcedBy: '' }),
    ).rejects.toThrow(InvalidRecordError)
  })

  it('refuses a field of another type', async () => {
    await expect(
      // @ts-expect-error a Guardrail has no metric
      addPart(db, 'glue', { ...guardrail, metric: 'lead time' }),
    ).rejects.toThrow(InvalidRecordError)
  })

  it('refuses a status that the type does not have', async () => {
    await expect(
      // @ts-expect-error a Goal is open or achieved
      addPart(db, 'glue', { ...goal, status: 'accepted' }),
    ).rejects.toThrow(InvalidRecordError)
    await expect(
      addPart(db, 'glue', { ...decision, status: 'superseded' }),
    ).rejects.toThrow(InvalidRecordError)
  })
})

describe('updatePart', () => {
  beforeEach(async () => {
    await addProject(db, 'glue')
    await addPart(db, 'glue', goal)
    await addPart(db, 'glue', { ...insight, status: 'draft' })
    await addPart(db, 'glue', guardrail)
    await addPart(db, 'glue', { ...decision, status: 'proposed' })
  })

  it('changes the title, the body, the owner and the rule check of a Guardrail', async () => {
    await updatePart(db, 'glue', 'R1', {
      title: 'UI is Carbon, not Mantine',
      body: 'D32 moved the UI kit.',
      owner: 'tim',
      enforcedBy: 'interface-review',
    })

    expect(await showPart('R1')).toMatchObject({
      title: 'UI is Carbon, not Mantine',
      body: 'D32 moved the UI kit.',
      owner: 'tim',
      enforcedBy: 'interface-review',
    })
  })

  it('changes only the fields that the change names', async () => {
    await updatePart(db, 'glue', 'G1', { status: 'achieved' })

    expect(await showPart('G1')).toMatchObject({
      title: 'Ship faster',
      metric: 'lead time',
      source: 'okr',
      status: 'achieved',
    })
  })

  it('keeps a draft Insight, and sets how sure it is', async () => {
    await updatePart(db, 'glue', 'I1', {
      status: null,
      evidenceLevel: 'confirmed',
    })

    expect(await showPart('I1')).toMatchObject({
      status: null,
      evidenceLevel: 'confirmed',
    })
  })

  it('accepts a proposed Decision', async () => {
    await updatePart(db, 'glue', 'D1', { status: 'accepted' })

    expect(await showPart('D1')).toMatchObject({ status: 'accepted' })
  })

  it.each([null, 'https://github.com/timschoch/glue/issues/129'])(
    'refuses the issue %s of a Decision in a request',
    async (issueUrl) => {
      const refused = expect.objectContaining({
        message: expect.stringContaining('issueUrl'),
      })

      expect(() => parsePartChange('decision', { issueUrl })).toThrow(refused)
      expect(() => parseNewPart({ ...decision, issueUrl })).toThrow(refused)
      await expect(
        // @ts-expect-error A change has no issue.
        updatePart(db, 'glue', 'D1', { issueUrl }),
      ).rejects.toThrow(refused)
    },
  )

  it('removes the successor of a superseded Decision that gets another status', async () => {
    await addPart(db, 'glue', { ...decision, supersedes: 'D1' })

    await updatePart(db, 'glue', 'D1', { status: 'accepted' })

    expect(await showPart('D1')).toMatchObject({
      status: 'accepted',
      supersededById: null,
    })
  })

  it('keeps the successor of a superseded Decision that gets another title', async () => {
    await addPart(db, 'glue', { ...decision, supersedes: 'D1' })

    await updatePart(db, 'glue', 'D1', { title: 'Cache the home page' })

    // The Part 5 is D2.
    expect(await showPart('D1')).toMatchObject({
      title: 'Cache the home page',
      status: 'superseded',
      supersededById: 5,
    })
  })

  it('refuses a Part that the Project does not have', async () => {
    await expect(
      updatePart(db, 'glue', 'R7', { title: 'UI is Carbon' }),
    ).rejects.toThrow(new InvalidRecordError('guardrail "R7" not found'))
    await expect(
      updatePart(db, 'flexibeck', 'R1', { title: 'UI is Carbon' }),
    ).rejects.toThrow(ProductNotFoundError)
  })

  it('changes nothing when the Part is not in the expected state', async () => {
    const accepted = { status: 'accepted' } as const
    const proposed = { status: 'proposed' }

    expect(await updatePart(db, 'glue', 'D1', accepted, proposed)).toBe(true)
    expect(await updatePart(db, 'glue', 'D1', accepted, proposed)).toBe(false)
    expect(
      await updatePart(db, 'glue', 'I1', { status: null }, { status: null }),
    ).toBe(false)
    expect(await showPart('I1')).toMatchObject({ status: 'draft' })
  })

  it('sets the issue of a Decision only when it has none', async () => {
    const first = 'https://github.com/timschoch/glue/issues/1'
    const second = 'https://github.com/timschoch/glue/issues/2'

    expect(await setIssueUrl(db, 'glue', 'D1', first)).toBe(true)
    expect(await setIssueUrl(db, 'glue', 'D1', second)).toBe(false)
    expect(await showPart('D1')).toMatchObject({ issueUrl: first })
  })

  it('sets no issue for a Part that is no Decision', async () => {
    await expect(
      setIssueUrl(
        db,
        'glue',
        'I1',
        'https://github.com/timschoch/glue/issues/1',
      ),
    ).rejects.toThrow(new InvalidRecordError('"I1" is not a Decision'))
  })

  it('sets the measure and the status of a Goal as one change', async () => {
    await updatePart(db, 'glue', 'G1', { measure: funnel, status: 'achieved' })

    expect(await showPart('G1')).toMatchObject({ status: 'achieved' })
    expect(await db.select().from(schema.measures)).toMatchObject([
      { partId: 1, measure: funnel },
    ])
  })

  it('sets no measure when the Part is not in the expected state', async () => {
    const change = { measure: funnel, status: 'achieved' } as const

    expect(
      await updatePart(db, 'glue', 'G1', change, { status: 'achieved' }),
    ).toBe(false)
    expect(await showPart('G1')).toMatchObject({ status: 'open' })
    expect(await db.select().from(schema.measures)).toEqual([])
  })

  it('refuses a change without a field', async () => {
    await expect(updatePart(db, 'glue', 'R1', {})).rejects.toThrow(
      new InvalidRecordError('send at least one field'),
    )
  })

  it('refuses a field of another type', async () => {
    await expect(
      updatePart(db, 'glue', 'R1', { metric: 'lead time' }),
    ).rejects.toThrow(InvalidRecordError)
    expect(await showPart('R1')).toMatchObject({ metric: null })
  })

  it('refuses to empty a field that the type must have', async () => {
    await expect(
      updatePart(db, 'glue', 'R1', { enforcedBy: ' ' }),
    ).rejects.toThrow(InvalidRecordError)
    await expect(updatePart(db, 'glue', 'D1', { owner: null })).rejects.toThrow(
      InvalidRecordError,
    )
  })

  it('refuses a status that the type does not have', async () => {
    await expect(
      updatePart(db, 'glue', 'G1', { status: 'accepted' }),
    ).rejects.toThrow(InvalidRecordError)
    await expect(
      // @ts-expect-error a Decision becomes superseded by its successor only
      updatePart(db, 'glue', 'D1', { status: 'superseded' }),
    ).rejects.toThrow(InvalidRecordError)
  })
})

describe('removePart', () => {
  beforeEach(async () => {
    await addProject(db, 'glue')
    await addPart(db, 'glue', goal)
    await addPart(db, 'glue', { ...insight, status: 'draft' })
    await addPart(db, 'glue', guardrail)
  })

  it('removes the Part with the Joints to the Parts that it needs', async () => {
    await addPart(db, 'glue', decision)

    expect(await removePart(db, 'glue', 'D1')).toBe(true)

    expect(await listJoints()).toEqual([])
    expect(await db.select().from(schema.parts)).toHaveLength(3)
  })

  it('keeps a Part that another Part needs', async () => {
    await addPart(db, 'glue', decision)

    expect(await removePart(db, 'glue', 'I1', { status: 'draft' })).toBe(false)

    expect(await listJoints()).toHaveLength(2)
    expect(await db.select().from(schema.parts)).toHaveLength(4)
  })

  it('keeps a Part that is not in the expected state', async () => {
    await updatePart(db, 'glue', 'I1', { status: null })

    expect(await removePart(db, 'glue', 'I1', { status: 'draft' })).toBe(false)
    expect(await removePart(db, 'glue', 'I1', { status: null })).toBe(true)
  })

  it('refuses a Part that the Project does not have', async () => {
    await expect(removePart(db, 'glue', 'I7')).rejects.toThrow(
      new InvalidRecordError('insight "I7" not found'),
    )
  })
})

// The Parts 1 to 4 are G1, I1, R1 and D1. I1 has its home in `part-model`,
// the others in the root. The Joints 1 and 2: D1 needs G1, D1 needs I1.
async function addGluedParts() {
  await addProject(db, 'glue')
  await addConcept(db, 'glue', { slug: 'part-model', title: 'Part model' })
  await addPart(db, 'glue', goal)
  await addPart(db, 'glue', { ...insight, concept: 'part-model' })
  await addPart(db, 'glue', guardrail)
  await addPart(db, 'glue', decision)
}

describe('addJoint', () => {
  beforeEach(addGluedParts)

  it('glues a Part to the Part it needs, one-way', async () => {
    const id = await addJoint(db, 'glue', { part: 'R1', needs: 'G1' })

    expect(id).toBe(3)
    expect((await listJoints())[2]).toEqual({
      id: 3,
      partId: 3,
      neededPartId: 1,
      twoWay: false,
    })
  })

  it('glues two Parts two-way', async () => {
    await addJoint(db, 'glue', { part: 'R1', needs: 'G1', twoWay: true })

    expect((await listJoints())[2]).toMatchObject({ twoWay: true })
  })

  it('links Parts of two Concepts, and each Part keeps its home', async () => {
    await addJoint(db, 'glue', { part: 'R1', needs: 'I1' })

    expect((await listJoints())[2]).toMatchObject({
      partId: 3,
      neededPartId: 2,
    })
    expect(await showPart('R1')).toMatchObject({ conceptId: 1 })
    expect(await showPart('I1')).toMatchObject({ conceptId: 2 })
    expect(await db.select().from(schema.parts)).toHaveLength(4)
  })

  it('refuses a Part that the Project does not have', async () => {
    await addProject(db, 'flexibeck')
    await addPart(db, 'flexibeck', { type: 'entity', title: 'Technique' })

    await expect(
      addJoint(db, 'glue', { part: 'R1', needs: 'E1' }),
    ).rejects.toThrow(new InvalidRecordError('entity "E1" not found'))
    await expect(
      addJoint(db, 'glue', { part: 'E1', needs: 'R1' }),
    ).rejects.toThrow(new InvalidRecordError('entity "E1" not found'))
    await expect(
      addJoint(db, 'bakeday', { part: 'R1', needs: 'G1' }),
    ).rejects.toThrow(ProductNotFoundError)
  })

  it('refuses a Joint from a Part to itself', async () => {
    await expect(
      addJoint(db, 'glue', { part: 'R1', needs: 'R1' }),
    ).rejects.toThrow(new InvalidRecordError('a Part cannot need itself'))
  })

  it('refuses a second Joint of the same two Parts, in either direction', async () => {
    await expect(
      addJoint(db, 'glue', { part: 'D1', needs: 'I1' }),
    ).rejects.toThrow(
      new InvalidRecordError('"D1" and "I1" have a Joint already'),
    )
    await expect(
      addJoint(db, 'glue', { part: 'I1', needs: 'D1', twoWay: true }),
    ).rejects.toThrow(
      new InvalidRecordError('"I1" and "D1" have a Joint already'),
    )
    await expect(
      addJoint(db, 'glue', { part: 'G1', needs: 'D1', twoWay: true }),
    ).rejects.toThrow(new InvalidRecordError('"D1" has a Goal already'))
    expect(await listJoints()).toHaveLength(2)
  })

  it('refuses a second Goal for a Decision', async () => {
    await addPart(db, 'glue', goal)

    await expect(
      addJoint(db, 'glue', { part: 'D1', needs: 'G2' }),
    ).rejects.toThrow(new InvalidRecordError('"D1" has a Goal already'))
    expect(await listJoints()).toHaveLength(2)
    expect(await addJoint(db, 'glue', { part: 'R1', needs: 'G2' })).toBe(3)
  })

  it('refuses a second Goal for a Decision through a two-way Joint', async () => {
    await addPart(db, 'glue', goal)

    await expect(
      addJoint(db, 'glue', { part: 'G2', needs: 'D1', twoWay: true }),
    ).rejects.toThrow(new InvalidRecordError('"D1" has a Goal already'))
    expect(await listJoints()).toHaveLength(2)
  })

  it('refuses a Goal for a Decision that has its Goal through a two-way Joint', async () => {
    await addPart(db, 'glue', goal)
    await client.exec(`
      delete from joints where id = 1;
      insert into joints (part_id, needed_part_id, two_way) values (1, 4, true);
    `)

    await expect(
      addJoint(db, 'glue', { part: 'D1', needs: 'G2' }),
    ).rejects.toThrow(new InvalidRecordError('"D1" has a Goal already'))
  })

  it('glues a Goal that needs a Decision, one-way', async () => {
    await addPart(db, 'glue', goal)

    expect(await addJoint(db, 'glue', { part: 'G2', needs: 'D1' })).toBe(3)
  })
})

describe('removeJoint', () => {
  beforeEach(addGluedParts)

  it('removes the Joint, and keeps its Parts', async () => {
    const id = await addJoint(db, 'glue', { part: 'R1', needs: 'G1' })

    await removeJoint(db, 'glue', id)

    expect((await listJoints()).map((joint) => joint.id)).toEqual([1, 2])
    expect(await db.select().from(schema.parts)).toHaveLength(4)
  })

  it('removes evidence of a Decision that has more evidence', async () => {
    const id = await addJoint(db, 'glue', { part: 'D1', needs: 'R1' })

    await removeJoint(db, 'glue', 2)

    expect((await listJoints()).map((joint) => joint.id)).toEqual([1, id])
  })

  it('refuses to remove the last Goal of a Decision', async () => {
    await expect(removeJoint(db, 'glue', 1)).rejects.toThrow(
      new InvalidRecordError(
        'a Decision needs a Goal and evidence: joint 1 is its last one',
      ),
    )
    expect(await listJoints()).toHaveLength(2)
  })

  it('refuses to remove the last evidence of a Decision', async () => {
    await expect(removeJoint(db, 'glue', 2)).rejects.toThrow(
      new InvalidRecordError(
        'a Decision needs a Goal and evidence: joint 2 is its last one',
      ),
    )
    expect(await listJoints()).toHaveLength(2)
  })

  it('refuses a Joint that the Project does not have', async () => {
    await addProject(db, 'flexibeck')

    await expect(removeJoint(db, 'glue', 7)).rejects.toThrow(
      new InvalidRecordError('joint 7 not found'),
    )
    await expect(removeJoint(db, 'flexibeck', 1)).rejects.toThrow(
      new InvalidRecordError('joint 1 not found'),
    )
    expect(await listJoints()).toHaveLength(2)
  })
})

describe('supersedeDecision', () => {
  // The Part 5 is D2.
  beforeEach(async () => {
    await addGluedParts()
    await addPart(db, 'glue', decision)
  })

  it('marks the Decision as superseded and points it to its successor', async () => {
    await supersedeDecision(db, 'glue', 'D1', 'D2')

    expect(await showPart('D1')).toMatchObject({
      status: 'superseded',
      supersededById: 5,
    })
    expect(await showPart('D2')).toMatchObject({
      status: 'accepted',
      supersededById: null,
    })
    expect(await listJoints()).toHaveLength(4)
  })

  it('keeps the first successor of a Decision that is superseded already', async () => {
    await addPart(db, 'glue', decision)
    await supersedeDecision(db, 'glue', 'D1', 'D2')

    await expect(supersedeDecision(db, 'glue', 'D1', 'D3')).rejects.toThrow(
      new InvalidRecordError('"D1" is superseded already'),
    )
    expect(await showPart('D1')).toMatchObject({ supersededById: 5 })
  })

  it('refuses a successor that is not accepted', async () => {
    await addPart(db, 'glue', { ...decision, status: 'proposed' })

    await expect(supersedeDecision(db, 'glue', 'D1', 'D3')).rejects.toThrow(
      new InvalidRecordError('"D3" is not accepted'),
    )
    await supersedeDecision(db, 'glue', 'D1', 'D2')
    await expect(supersedeDecision(db, 'glue', 'D2', 'D1')).rejects.toThrow(
      new InvalidRecordError('"D1" is not accepted'),
    )
  })

  // The other request runs between the read of the two Decisions and the
  // statement of this request.
  it('refuses two Decisions that supersede each other at the same time', async () => {
    const execute = db.execute.bind(db)
    const competing = vi.spyOn(db, 'execute')
    competing.mockImplementationOnce(((query: Parameters<typeof execute>[0]) =>
      supersedeDecision(db, 'glue', 'D2', 'D1').then(() =>
        execute(query),
      )) as typeof db.execute)

    await expect(supersedeDecision(db, 'glue', 'D1', 'D2')).rejects.toThrow(
      new InvalidRecordError('"D2" is not accepted'),
    )
    competing.mockRestore()

    expect(await showPart('D1')).toMatchObject({
      status: 'accepted',
      supersededById: null,
    })
    expect(await showPart('D2')).toMatchObject({
      status: 'superseded',
      supersededById: 4,
    })
  })

  it('refuses a Decision as its own successor', async () => {
    await expect(supersedeDecision(db, 'glue', 'D1', 'D1')).rejects.toThrow(
      new InvalidRecordError('a Decision cannot supersede itself'),
    )
  })

  it('refuses a Part that is not a Decision', async () => {
    await expect(supersedeDecision(db, 'glue', 'G1', 'D2')).rejects.toThrow(
      new InvalidRecordError('"G1" is not a Decision'),
    )
    await expect(supersedeDecision(db, 'glue', 'D1', 'G1')).rejects.toThrow(
      new InvalidRecordError('"G1" is not a Decision'),
    )
  })

  it('refuses a Decision that the Project does not have', async () => {
    await expect(supersedeDecision(db, 'glue', 'D7', 'D2')).rejects.toThrow(
      new InvalidRecordError('decision "D7" not found'),
    )
    await expect(supersedeDecision(db, 'glue', 'D1', 'D7')).rejects.toThrow(
      new InvalidRecordError('decision "D7" not found'),
    )
  })
})

describe('updatePart with a measure', () => {
  beforeEach(addGluedParts)

  it('stores how Glue measures a Goal', async () => {
    await updatePart(db, 'glue', 'G1', { measure: funnel })

    expect(await db.select().from(schema.measures)).toEqual([
      {
        partId: 1,
        measure: funnel,
        baseline: null,
        latestValue: null,
        latestBreakdownValue: null,
        measuredAt: null,
      },
    ])
  })

  it('stores how Glue measures a Metric', async () => {
    await addPart(db, 'glue', { type: 'metric', title: 'Ease of use' })

    await updatePart(db, 'glue', 'M1', { measure: mean })

    expect(await db.select().from(schema.measures)).toMatchObject([
      { partId: 5, measure: mean },
    ])
  })

  it('removes the readings of the measure that it replaces', async () => {
    await updatePart(db, 'glue', 'G1', { measure: mean })
    await setReading(db, 'glue', 'G1', reading)

    await updatePart(db, 'glue', 'G1', { measure: funnel })

    expect(await db.select().from(schema.measures)).toEqual([
      {
        partId: 1,
        measure: funnel,
        baseline: null,
        latestValue: null,
        latestBreakdownValue: null,
        measuredAt: null,
      },
    ])
  })

  it('stops measuring the Part when the measure is null', async () => {
    await updatePart(db, 'glue', 'G1', { measure: funnel })

    await updatePart(db, 'glue', 'G1', { measure: null })

    expect(await db.select().from(schema.measures)).toEqual([])
  })

  it('refuses a measure on a Part that is not a Goal or a Metric', async () => {
    await expect(
      updatePart(db, 'glue', 'R1', { measure: funnel, title: 'UI is Carbon' }),
    ).rejects.toThrow(InvalidRecordError)
    expect(await db.select().from(schema.measures)).toEqual([])
  })

  it('refuses a measure that is not a funnel or a mean', async () => {
    await expect(
      updatePart(db, 'glue', 'G1', {
        // @ts-expect-error a funnel has steps
        measure: { kind: 'funnel', source: 'mock-analytics' },
      }),
    ).rejects.toThrow(InvalidRecordError)
    expect(await db.select().from(schema.measures)).toEqual([])
  })
})

describe('setReading', () => {
  beforeEach(addGluedParts)

  it('stores what a measure run read, and when', async () => {
    await updatePart(db, 'glue', 'G1', { measure: mean })

    await setReading(db, 'glue', 'G1', reading)

    expect(await db.select().from(schema.measures)).toEqual([
      { partId: 1, measure: mean, ...reading },
    ])
  })

  it('refuses a reading for a Part without a measure', async () => {
    await expect(setReading(db, 'glue', 'G1', reading)).rejects.toThrow(
      new InvalidRecordError('"G1" has no measure'),
    )
  })

  it('refuses a Part that the Project does not have', async () => {
    await expect(setReading(db, 'glue', 'G7', reading)).rejects.toThrow(
      new InvalidRecordError('goal "G7" not found'),
    )
  })
})
