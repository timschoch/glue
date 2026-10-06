import { beforeEach, describe, expect, it } from 'vitest'

import {
  findConcept,
  findPart,
  findProject,
  listMapJoints,
  listMeasured,
  listParts,
  listProjects,
} from './parts.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { client, db } = createTestDatabase(schema)

const measure = {
  kind: 'funnel',
  source: 'mock-analytics',
  steps: ['signed-up', 'paid'],
  target: 0.2,
  window_days: 7,
}

// Project 1 is glue. Its root Concept 1 holds the Concept 2 (part-model, a
// Brief), which holds the Concept 3 (read-model, no Kind).
// Project 2 is flexibeck with the root Concept 4.
//
// Parts of glue, by row id: 1 G1 and 7 R1 in the root, 2 I1, 3 D1 and 4 D2
// in part-model, 5 E1 and 6 F1 in read-model. D2 supersedes D1.
// Part 8 is the G1 of flexibeck.
//
// Joints: 1 D1 needs G1 (a link), 2 D1 needs I1, 3 E1 and F1 need each
// other, 4 F1 needs D1 (a link).
beforeEach(async () => {
  await client.exec(`
    insert into projects (slug, name) values ('glue', 'Glue'), ('flexibeck', 'flexibeck');
    insert into concepts (project_id, parent_id, slug, title, kind) values
      (1, null, 'glue', 'Glue', null),
      (1, 1, 'part-model', 'Part model', 'brief'),
      (1, 2, 'read-model', 'Read model', null),
      (2, null, 'flexibeck', 'flexibeck', null);
    insert into parts (project_id, concept_id, type, record_id, title, body, status, metric, source) values
      (1, 1, 'goal', 'G1', 'More users pay', 'Why the Goal exists.', 'open', 'signup to paid', 'okr');
    insert into parts (project_id, concept_id, type, record_id, title, date, source, evidence_level) values
      (1, 2, 'insight', 'I1', 'Bakers want step videos', '2026-10-01', 'interview', 'pattern');
    insert into parts (project_id, concept_id, type, record_id, title, body, status, date, owner, issue_url) values
      (1, 2, 'decision', 'D1', 'Show the video of the creator', 'One video per step.', 'superseded', '2026-10-02', 'Tim', 'https://github.com/timschoch/glue/issues/1'),
      (1, 2, 'decision', 'D2', 'Show the video of the baker', '', 'proposed', '2026-10-03', 'Tim', null);
    update parts set superseded_by_id = 4 where id = 3;
    insert into parts (project_id, concept_id, type, record_id, title, owner) values
      (1, 3, 'entity', 'E1', 'Technique', 'Tim'),
      (1, 3, 'flow', 'F1', 'Read a Concept', null);
    insert into parts (project_id, concept_id, type, record_id, title, enforced_by) values
      (1, 1, 'guardrail', 'R1', 'No query over 200ms', 'none yet');
    insert into parts (project_id, concept_id, type, record_id, title, status, metric, source) values
      (2, 4, 'goal', 'G1', 'Bakers bake more', 'achieved', 'bakes per week', 'okr');
    insert into joints (part_id, needed_part_id, two_way) values
      (3, 1, false),
      (3, 2, false),
      (5, 6, true),
      (6, 3, false);
    insert into measures (part_id, measure, baseline, latest_value, measured_at) values
      (1, '${JSON.stringify(measure)}', 0.1, 0.15, '2026-10-02T08:00:00Z');
  `)
})

// The rows of the test have no Trust and no Work state of their own.
const state = {
  trust: 'not-ready',
  workState: 'draft',
  emptySlots: [],
  reviewNotes: [],
}

const goal = {
  ...state,
  id: 'G1',
  type: 'goal',
  title: 'More users pay',
  status: 'open',
  concept: 'glue',
  conceptTitle: 'Glue',
}
// The reading of G1 misses the target of its funnel.
const goalMeasure = {
  measure,
  baseline: 0.1,
  latestValue: 0.15,
  latestBreakdownValue: null,
  measuredAt: '2026-10-02T08:00:00.000Z',
  target: 0.2,
  onTarget: false,
}
const insight = {
  ...state,
  id: 'I1',
  type: 'insight',
  title: 'Bakers want step videos',
  status: null,
  concept: 'part-model',
  conceptTitle: 'Part model',
}
const decision = {
  ...state,
  id: 'D1',
  type: 'decision',
  title: 'Show the video of the creator',
  status: 'superseded',
  concept: 'part-model',
  conceptTitle: 'Part model',
}
const replacement = {
  ...state,
  id: 'D2',
  emptySlots: ['goal', 'evidence'],
  type: 'decision',
  title: 'Show the video of the baker',
  status: 'proposed',
  concept: 'part-model',
  conceptTitle: 'Part model',
}
const guardrail = {
  ...state,
  id: 'R1',
  type: 'guardrail',
  title: 'No query over 200ms',
  status: null,
  concept: 'glue',
  conceptTitle: 'Glue',
}
const entity = {
  ...state,
  id: 'E1',
  emptySlots: ['decision'],
  type: 'entity',
  title: 'Technique',
  status: null,
  concept: 'read-model',
  conceptTitle: 'Read model',
}
const flow = {
  ...state,
  id: 'F1',
  type: 'flow',
  title: 'Read a Concept',
  status: null,
  concept: 'read-model',
  conceptTitle: 'Read model',
}

const readModel = {
  slug: 'read-model',
  title: 'Read model',
  kind: null,
  partCount: 2,
  concepts: [],
}
const partModel = {
  slug: 'part-model',
  title: 'Part model',
  kind: 'brief',
  partCount: 5,
  concepts: [readModel],
}

describe('listProjects', () => {
  it('returns each Project, in the order of the slugs', async () => {
    expect(await listProjects(db)).toEqual([
      { slug: 'flexibeck', name: 'flexibeck' },
      { slug: 'glue', name: 'Glue' },
    ])
  })
})

describe('findProject', () => {
  it('returns the Project with the tree of its Concepts', async () => {
    expect(await findProject(db, 'glue')).toEqual({
      slug: 'glue',
      name: 'Glue',
      concept: {
        slug: 'glue',
        title: 'Glue',
        kind: null,
        partCount: 7,
        concepts: [partModel],
      },
    })
  })

  it('counts the Parts of a Concept with the Parts of the Concepts in it', async () => {
    await client.exec(`
      insert into concepts (project_id, parent_id, slug, title) values
        (2, 4, 'build-run', 'Build run'),
        (2, 5, 'gates', 'Gates');
      insert into parts (project_id, concept_id, type, record_id, title) values
        (2, 6, 'flow', 'F1', 'Merge gate'),
        (2, 6, 'flow', 'F2', 'Push gate'),
        (2, 6, 'entity', 'E1', 'Check');
    `)

    const project = await findProject(db, 'flexibeck')

    expect(project?.concept.concepts).toEqual([
      {
        slug: 'build-run',
        title: 'Build run',
        kind: null,
        partCount: 3,
        concepts: [
          {
            slug: 'gates',
            title: 'Gates',
            kind: null,
            partCount: 3,
            concepts: [],
          },
        ],
      },
    ])
  })

  it('returns nothing for an unknown Project', async () => {
    expect(await findProject(db, 'bakeday')).toBeUndefined()
  })
})

describe('findConcept', () => {
  it('returns the Concept with its path, its child Concepts and its home Parts', async () => {
    const concept = await findConcept(db, 'glue', 'part-model')

    expect(concept).toMatchObject({
      slug: 'part-model',
      title: 'Part model',
      kind: 'brief',
      path: [{ slug: 'glue', title: 'Glue' }],
      concepts: [readModel],
      parts: [insight, decision, replacement],
    })
  })

  it('carries no count of its Parts: it has the Parts', async () => {
    const concept = await findConcept(db, 'glue', 'part-model')

    expect(concept).not.toHaveProperty('partCount')
  })

  it('returns the path from the root down to the parent', async () => {
    const concept = await findConcept(db, 'glue', 'read-model')

    expect(concept?.path).toEqual([
      { slug: 'glue', title: 'Glue' },
      { slug: 'part-model', title: 'Part model' },
    ])
  })

  it('returns the Joints of its Parts, and marks a Joint to another Concept as a link', async () => {
    const concept = await findConcept(db, 'glue', 'part-model')

    expect(concept?.joints).toEqual([
      { id: 1, part: 'D1', needs: 'G1', twoWay: false, link: true },
      { id: 2, part: 'D1', needs: 'I1', twoWay: false, link: false },
      { id: 4, part: 'F1', needs: 'D1', twoWay: false, link: true },
    ])
  })

  it('returns the Parts of other Concepts that a link glues to it', async () => {
    const concept = await findConcept(db, 'glue', 'part-model')

    expect(concept?.linkedParts).toEqual([goal, flow])
  })

  it('fills a slot with a home Part or a linked Part of its type', async () => {
    const concept = await findConcept(db, 'glue', 'part-model')

    expect(concept?.slots).toEqual([
      { type: 'insight', filled: true },
      { type: 'goal', filled: true },
      { type: 'decision', filled: true },
      { type: 'metric', filled: false },
      { type: 'flow', filled: true },
      { type: 'entity', filled: false },
      { type: 'guardrail', filled: false },
    ])
  })

  it('returns a two-way Joint, and no slot for a Concept without a Kind', async () => {
    expect(await findConcept(db, 'glue', 'read-model')).toMatchObject({
      kind: null,
      concepts: [],
      parts: [entity, flow],
      linkedParts: [decision],
      joints: [
        { id: 3, part: 'E1', needs: 'F1', twoWay: true, link: false },
        { id: 4, part: 'F1', needs: 'D1', twoWay: false, link: true },
      ],
      slots: [],
    })
  })

  it('returns the root Concept with an empty path', async () => {
    expect(await findConcept(db, 'glue', 'glue')).toMatchObject({
      path: [],
      concepts: [partModel],
      parts: [goal, guardrail],
      linkedParts: [decision],
    })
  })

  it('returns nothing for an unknown Concept, or a Concept of another Project', async () => {
    expect(await findConcept(db, 'glue', 'videos')).toBeUndefined()
    expect(await findConcept(db, 'glue', 'flexibeck')).toBeUndefined()
    expect(await findConcept(db, 'bakeday', 'part-model')).toBeUndefined()
  })
})

describe('listParts', () => {
  it('returns the Parts of the Project, by type and then by number', async () => {
    expect(await listParts(db, 'glue')).toEqual([
      insight,
      goal,
      decision,
      replacement,
      guardrail,
      entity,
      flow,
    ])
  })

  it('returns only the Parts of the given types', async () => {
    expect(await listParts(db, 'glue', ['decision', 'goal'])).toEqual([
      goal,
      decision,
      replacement,
    ])
  })

  it('sorts the Parts of a type by the number in the id', async () => {
    await client.exec(`
      insert into parts (project_id, concept_id, type, record_id, title, enforced_by) values
        (1, 1, 'guardrail', 'R10', 'No secret in logs', 'none yet'),
        (1, 1, 'guardrail', 'R2', 'No Tailwind', 'lint');
    `)

    const found = await listParts(db, 'glue', ['guardrail'])

    expect(found.map(({ id }) => id)).toEqual(['R1', 'R2', 'R10'])
  })

  it('returns no Part for an unknown Project', async () => {
    expect(await listParts(db, 'bakeday')).toEqual([])
  })
})

describe('findPart', () => {
  it('returns a Decision with its fields, what it needs and what needs it', async () => {
    expect(await findPart(db, 'glue', 'D1')).toEqual({
      ...decision,
      body: 'One video per step.',
      owner: 'Tim',
      date: '2026-10-02',
      source: null,
      metric: null,
      enforcedBy: null,
      evidenceLevel: null,
      issueUrl: 'https://github.com/timschoch/glue/issues/1',
      measure: null,
      supersededBy: replacement,
      supersedes: [],
      needs: [
        {
          jointId: 1,
          twoWay: false,
          link: true,
          contractVersion: null,
          part: goal,
        },
        {
          jointId: 2,
          twoWay: false,
          link: false,
          contractVersion: null,
          part: insight,
        },
      ],
      neededBy: [
        {
          jointId: 4,
          twoWay: false,
          link: true,
          contractVersion: null,
          part: flow,
        },
      ],
      measured: [{ ...goal, measure: goalMeasure }],
      flags: [],
      waitsOn: null,
      signals: [],
      answers: ['supersede', 'not-ready', 'sink'],
      activity: [{ kind: 'changed', at: expect.any(String) }],
      question: null,
      // Superseded, and never accepted.
      unchosen: true,
    })
  })

  it('lists what happened to the Part, newest first', async () => {
    await client.exec(`
      update parts set published_at = '2026-10-02T08:00:00Z', changed_at = '2026-10-04T08:00:00Z' where id = 6;
      insert into flags (part_id, cause_part_id, reason, created_at, closed_at) values
        (6, 3, 'changed', '2026-10-03T08:00:00Z', '2026-10-03T09:00:00Z'),
        (6, 5, 'not-ready', '2026-10-03T10:00:00Z', null);
    `)
    const changed = {
      cause: { id: 'D1', title: 'Show the video of the creator' },
      reason: 'changed',
    }

    const part = await findPart(db, 'glue', 'F1')

    expect(part?.activity).toEqual([
      { kind: 'changed', at: '2026-10-04T08:00:00.000Z' },
      {
        kind: 'flag-opened',
        at: '2026-10-03T10:00:00.000Z',
        cause: { id: 'E1', title: 'Technique' },
        reason: 'not-ready',
      },
      { kind: 'flag-closed', at: '2026-10-03T09:00:00.000Z', ...changed },
      { kind: 'flag-opened', at: '2026-10-03T08:00:00.000Z', ...changed },
      { kind: 'published', at: '2026-10-02T08:00:00.000Z' },
    ])
    expect(part?.flags).toEqual([
      {
        cause: { id: 'E1', title: 'Technique' },
        reason: 'not-ready',
        createdAt: '2026-10-03T10:00:00.000Z',
      },
    ])
  })

  it('leaves out the change that is the sign-off itself', async () => {
    await client.exec(`
      update parts set published_at = '2026-10-02T08:00:00Z', changed_at = '2026-10-02T08:00:00Z' where id = 6;
    `)

    expect((await findPart(db, 'glue', 'F1'))?.activity).toEqual([
      { kind: 'published', at: '2026-10-02T08:00:00.000Z' },
    ])
  })

  it('returns the Parts that a Part supersedes', async () => {
    expect(await findPart(db, 'glue', 'D2')).toMatchObject({
      supersededBy: null,
      supersedes: [decision],
    })
  })

  it('returns a Goal with its measure and the last readings', async () => {
    expect(await findPart(db, 'glue', 'G1')).toMatchObject({
      ...goal,
      body: 'Why the Goal exists.',
      metric: 'signup to paid',
      source: 'okr',
      measure: goalMeasure,
      measured: [],
      needs: [],
      neededBy: [{ jointId: 1, twoWay: false, link: true, part: decision }],
    })
  })

  it('returns the fields of an Insight and of a Guardrail', async () => {
    expect(await findPart(db, 'glue', 'I1')).toMatchObject({
      date: '2026-10-01',
      source: 'interview',
      evidenceLevel: 'pattern',
    })
    expect(await findPart(db, 'glue', 'R1')).toMatchObject({
      enforcedBy: 'none yet',
    })
  })

  it('shows a two-way Joint in needs on both sides', async () => {
    expect(await findPart(db, 'glue', 'E1')).toMatchObject({
      needs: [{ jointId: 3, twoWay: true, link: false, part: flow }],
      neededBy: [],
    })
    expect(await findPart(db, 'glue', 'F1')).toMatchObject({
      needs: [
        { jointId: 3, twoWay: true, link: false, part: entity },
        { jointId: 4, twoWay: false, link: true, part: decision },
      ],
      neededBy: [],
    })
  })

  it('reads a record id inside its Project only', async () => {
    expect(await findPart(db, 'flexibeck', 'G1')).toMatchObject({
      title: 'Bakers bake more',
      status: 'achieved',
      concept: 'flexibeck',
    })
  })

  it('returns nothing for an unknown Part or an unknown Project', async () => {
    expect(await findPart(db, 'glue', 'D9')).toBeUndefined()
    expect(await findPart(db, 'flexibeck', 'D1')).toBeUndefined()
    expect(await findPart(db, 'bakeday', 'G1')).toBeUndefined()
  })

  it.each(['X1', 'D1; drop table parts', ''])(
    'returns nothing for the id "%s"',
    async (recordId) => {
      expect(await findPart(db, 'glue', recordId)).toBeUndefined()
    },
  )

  it('has no target and no sign for a mean without a reading', async () => {
    const mean = {
      kind: 'mean',
      source: 'mock-analytics',
      event: 'survey sent',
      property: 'answer',
      target_change: 1,
      window_days: 7,
    }
    await client.exec(`
      insert into parts (project_id, concept_id, type, record_id, title) values
        (1, 1, 'metric', 'M1', 'Ease of the first bake');
      insert into measures (part_id, measure) values (9, '${JSON.stringify(mean)}');
    `)

    expect((await findPart(db, 'glue', 'M1'))?.measure).toMatchObject({
      latestValue: null,
      target: null,
      onTarget: null,
    })
  })
})

describe('listMeasured', () => {
  it('returns the Goals with a measure and all Metrics of the Project', async () => {
    await client.exec(`
      insert into parts (project_id, concept_id, type, record_id, title) values
        (1, 2, 'metric', 'M1', 'Ease of the first bake');
    `)

    expect(await listMeasured(db, 'glue')).toEqual([
      { ...goal, measure: goalMeasure },
      {
        ...state,
        id: 'M1',
        type: 'metric',
        title: 'Ease of the first bake',
        status: null,
        concept: 'part-model',
        conceptTitle: 'Part model',
        measure: null,
      },
    ])
  })

  it('leaves out a Goal without a measure', async () => {
    expect(await listMeasured(db, 'flexibeck')).toEqual([])
  })
})

describe('listMapJoints', () => {
  // D1 of glue needs the G1 of flexibeck too. The G1 of glue is wrong.
  beforeEach(async () => {
    await client.exec(`
      insert into joints (part_id, needed_part_id, two_way) values (3, 8, false);
      update parts set trust = 'wrong' where id = 1;
    `)
  })

  it('returns each Joint of the Project with the Trust of the Part that it needs', async () => {
    expect(await listMapJoints(db, 'glue')).toEqual([
      { id: 1, part: 'D1', needs: 'G1', trust: 'wrong' },
      { id: 2, part: 'D1', needs: 'I1', trust: 'not-ready' },
      { id: 3, part: 'E1', needs: 'F1', trust: 'not-ready' },
      { id: 4, part: 'F1', needs: 'D1', trust: 'not-ready' },
      {
        id: 5,
        part: 'D1',
        needs: 'G1',
        trust: 'not-ready',
        reference: { end: 'needs', slug: 'flexibeck', name: 'flexibeck' },
      },
    ])
  })

  it('names the other Project at the end of a reference that is not of the Project', async () => {
    expect(await listMapJoints(db, 'flexibeck')).toEqual([
      {
        id: 5,
        part: 'D1',
        needs: 'G1',
        trust: 'not-ready',
        reference: { end: 'part', slug: 'glue', name: 'Glue' },
      },
    ])
  })
})
