import { join } from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadConcept } from '../../scripts/check-concept.mjs'
import type { ConceptRecord } from './import-concept.ts'
import { importConcept } from './import-concept.ts'
import * as schema from './schema.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})

afterEach(async () => {
  await client.close()
})

const goal: ConceptRecord = {
  folder: 'goals',
  data: {
    id: 'G1',
    title: 'Ship faster',
    metric: 'lead time',
    source: 'https://example.com/g1',
  },
  body: 'Why the goal exists.',
}

const insight: ConceptRecord = {
  folder: 'insights',
  data: {
    id: 'I1',
    title: 'Users churn on slow loads',
    date: '2026-01-01',
    source: 'https://example.com/i1',
  },
  body: '',
}

const fact: ConceptRecord = {
  folder: 'facts',
  data: {
    id: 'F1',
    title: 'p95 load time is 3s',
    source: 'https://example.com/f1',
  },
  body: '',
}

const guardrail: ConceptRecord = {
  folder: 'guardrails',
  data: {
    id: 'R1',
    title: 'No query over 200ms',
    enforced_by: 'none yet',
  },
  body: '',
}

const decision: ConceptRecord = {
  folder: 'decisions',
  data: {
    id: 'D1',
    title: 'Cache the homepage',
    date: '2026-01-02',
    owner: 'tim',
    status: 'accepted',
    goal: 'G1',
    evidence: ['I1', 'F1'],
  },
  body: 'Cache reads at the edge.',
}

describe('importConcept', () => {
  it('imports every record type into the product', async () => {
    await importConcept(db, [goal, insight, fact, guardrail, decision], 'glue')

    expect(await db.select().from(schema.goals)).toHaveLength(1)
    expect(await db.select().from(schema.insights)).toHaveLength(1)
    expect(await db.select().from(schema.facts)).toHaveLength(1)
    expect(await db.select().from(schema.guardrails)).toHaveLength(1)
    expect(await db.select().from(schema.decisions)).toHaveLength(1)
  })

  it('imports the body below the frontmatter', async () => {
    await importConcept(db, [goal, insight, fact, decision], 'glue')

    const [storedGoal] = await db.select().from(schema.goals)
    const [storedDecision] = await db.select().from(schema.decisions)
    expect(storedGoal.body).toBe('Why the goal exists.')
    expect(storedDecision.body).toBe('Cache reads at the edge.')
  })

  it('defaults body to "" when a record has none', async () => {
    await importConcept(db, [insight], 'glue')

    const [storedInsight] = await db.select().from(schema.insights)
    expect(storedInsight.body).toBe('')
  })

  it('imports an optional Insight status', async () => {
    const draftInsight: ConceptRecord = {
      ...insight,
      data: { ...insight.data, status: 'draft' },
    }

    await importConcept(db, [draftInsight], 'glue')

    const [storedInsight] = await db.select().from(schema.insights)
    expect(storedInsight.status).toBe('draft')
  })

  it('leaves Insight status null when the record has none', async () => {
    await importConcept(db, [insight], 'glue')

    const [storedInsight] = await db.select().from(schema.insights)
    expect(storedInsight.status).toBeNull()
  })

  it('resolves a decision goal and evidence to real rows', async () => {
    await importConcept(db, [goal, insight, fact, decision], 'glue')

    const [storedDecision] = await db.select().from(schema.decisions)
    const [storedGoal] = await db.select().from(schema.goals)
    expect(storedDecision.goalId).toBe(storedGoal.id)

    const evidence = await db
      .select()
      .from(schema.decisionEvidence)
      .where(eq(schema.decisionEvidence.decisionId, storedDecision.id))
    expect(evidence).toHaveLength(2)
  })

  it('throws when an evidence id is neither an Insight nor a Fact', async () => {
    const badDecision: ConceptRecord = {
      ...decision,
      data: { ...decision.data, evidence: ['I1', 'R9'] },
    }

    await expect(
      importConcept(db, [goal, insight, fact, badDecision], 'glue'),
    ).rejects.toThrow(/decision D1: evidence "R9" not found/)
  })

  it('resolves superseded_by to the superseding decision', async () => {
    const supersededGoal = goal
    const oldDecision: ConceptRecord = {
      folder: 'decisions',
      data: {
        ...decision.data,
        id: 'D1',
        status: 'superseded',
        superseded_by: 'D2',
      },
      body: '',
    }
    const newDecision: ConceptRecord = {
      folder: 'decisions',
      data: { ...decision.data, id: 'D2' },
      body: '',
    }

    await importConcept(
      db,
      [supersededGoal, insight, fact, oldDecision, newDecision],
      'glue',
    )

    const rows = await db.select().from(schema.decisions)
    const old = rows.find((row) => row.recordId === 'D1')
    const superseding = rows.find((row) => row.recordId === 'D2')
    expect(old?.supersededById).toBe(superseding?.id)
  })

  it('changes nothing on a second import', async () => {
    await importConcept(db, [goal, insight, fact, guardrail, decision], 'glue')
    await importConcept(db, [goal, insight, fact, guardrail, decision], 'glue')

    expect(await db.select().from(schema.products)).toHaveLength(1)
    expect(await db.select().from(schema.goals)).toHaveLength(1)
    expect(await db.select().from(schema.decisions)).toHaveLength(1)
    const evidence = await db.select().from(schema.decisionEvidence)
    expect(evidence).toHaveLength(2)
  })
})

describe('importConcept on the real concept/', () => {
  it('imports one row per file and resolves every reference', async () => {
    const records = loadConcept(join(process.cwd(), 'concept'))

    await importConcept(db, records, 'glue')

    const countByFolder = (folder: ConceptRecord['folder']) =>
      records.filter((record) => record.folder === folder).length

    expect(await db.select().from(schema.goals)).toHaveLength(
      countByFolder('goals'),
    )
    expect(await db.select().from(schema.insights)).toHaveLength(
      countByFolder('insights'),
    )
    expect(await db.select().from(schema.facts)).toHaveLength(
      countByFolder('facts'),
    )
    expect(await db.select().from(schema.guardrails)).toHaveLength(
      countByFolder('guardrails'),
    )
    const storedDecisions = await db.select().from(schema.decisions)
    expect(storedDecisions).toHaveLength(countByFolder('decisions'))

    for (const storedDecision of storedDecisions) {
      expect(storedDecision.goalId).not.toBeNull()
      const evidence = await db
        .select()
        .from(schema.decisionEvidence)
        .where(eq(schema.decisionEvidence.decisionId, storedDecision.id))
      expect(evidence.length).toBeGreaterThan(0)
      for (const link of evidence) {
        expect(
          link.insightId !== null || link.factId !== null,
        ).toBe(true)
      }
    }
  })
})
