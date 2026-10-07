import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addPart,
  addProject,
  setIssueUrl,
  setReading,
  updatePart,
} from '../src/db/part-records.ts'
import * as schema from '../src/db/schema.ts'
import { createTestDatabase } from '../src/db/test-database.ts'
import { createFakeGithub } from '../src/test/github.ts'
import { runConcept } from './concept.ts'

describe('pnpm concept list and show', () => {
  const { db } = createTestDatabase(schema)
  const { github } = createFakeGithub()

  function run(...args: string[]) {
    return runConcept(db, () => github, args)
  }

  function logged(): string[] {
    return vi.mocked(console.log).mock.calls.map(([line]) => line)
  }

  // The Project glue has I1, G1, R1, E1 and D1. D1 needs R1, G1, E1 and I1,
  // in this order.
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-03T12:00Z') })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await addProject(db, 'glue')
    await addPart(db, 'glue', {
      type: 'insight',
      title: 'Users churn on slow loads',
      date: '2026-01-01',
      source: 'https://example.com/i1',
      status: 'draft',
      evidenceLevel: 'pattern',
      body: 'Seen in **three** interviews.',
    })
    await addPart(db, 'glue', {
      type: 'goal',
      title: 'Ship faster',
      metric: 'lead time',
      source: 'https://example.com/g1',
      body: 'Why the goal exists.',
    })
    await addPart(db, 'glue', {
      type: 'guardrail',
      title: 'No query over 200ms',
      enforcedBy: 'none yet',
    })
    await addPart(db, 'glue', { type: 'entity', title: 'Page cache' })
    await addPart(db, 'glue', {
      type: 'decision',
      title: 'Cache the homepage',
      date: '2026-01-02',
      owner: 'tim',
      status: 'accepted',
      body: 'Cache reads at the edge.',
      needs: ['R1', 'G1', 'E1', 'I1'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Adds the Decision D2 with its issue. It supersedes D1.
  async function addReplacement() {
    await addPart(db, 'glue', {
      type: 'decision',
      title: 'Cache every page',
      date: '2026-02-01',
      owner: 'tim',
      status: 'accepted',
      body: 'One rule for all pages.',
      needs: ['G1', 'R1'],
      supersedes: 'D1',
    })
    await setIssueUrl(
      db,
      'glue',
      'D2',
      'https://github.com/timschoch/glue/issues/1',
    )
  }

  describe('list', () => {
    it('lists the Parts type by type: Goals, Decisions, Insights, Guardrails, Entities, Flows, Metrics', async () => {
      await addReplacement()
      await addPart(db, 'glue', { type: 'metric', title: 'Load time' })
      await addPart(db, 'glue', { type: 'flow', title: 'Read a cached page' })

      await run('list')

      expect(logged()).toEqual([
        'G1  open  not-ready  draft  Ship faster',
        'D1  superseded  wrong  sunk  Cache the homepage',
        'D2  accepted  solid  published  Cache every page',
        'I1  draft  not-ready  draft  Users churn on slow loads',
        'R1  not-ready  draft  No query over 200ms',
        'E1  not-ready  draft  Page cache',
        'F1  not-ready  draft  Read a cached page',
        'M1  not-ready  draft  Load time',
      ])
    })

    it('lists the Parts of one type', async () => {
      await addReplacement()

      await run('list', 'decisions')

      expect(logged()).toEqual([
        'D1  superseded  wrong  sunk  Cache the homepage',
        'D2  accepted  solid  published  Cache every page',
      ])
    })

    it('says that the Project is missing', async () => {
      await expect(run('list', '--project', 'bakeday')).rejects.toThrow(
        'product "bakeday" not found',
      )
    })
  })

  describe('show', () => {
    it('shows a Decision with its Goal, its evidence, what else it needs and its successor', async () => {
      await addReplacement()

      await run('show', 'D1')

      expect(logged()).toEqual([
        'D1',
        'title: Cache the homepage',
        'date: 2026-01-02',
        'owner: tim',
        'status: superseded',
        'goal: G1 Ship faster',
        'evidence: R1 No query over 200ms',
        'evidence: I1 Users churn on slow loads',
        'needs: E1 Page cache',
        'superseded_by: D2',
        'trust: wrong',
        'work_state: sunk',
        'activity: 2026-10-03T12:00:00.000Z sunk',
        'activity: 2026-10-03T12:00:00.000Z published version 1',
        '\nCache reads at the edge.',
      ])
    })

    it('shows the issue of a Decision and the Decision that it supersedes', async () => {
      await addReplacement()

      await run('show', 'D2')

      expect(logged()).toEqual([
        'D2',
        'title: Cache every page',
        'date: 2026-02-01',
        'owner: tim',
        'status: accepted',
        'issue: https://github.com/timschoch/glue/issues/1',
        'goal: G1 Ship faster',
        'evidence: R1 No query over 200ms',
        'supersedes: D1',
        'trust: solid',
        'work_state: published',
        'activity: 2026-10-03T12:00:00.000Z published version 1',
        '\nOne rule for all pages.',
      ])
    })

    it('shows the empty slot of a Part', async () => {
      await run('show', 'E1')

      expect(logged()).toEqual([
        'E1',
        'title: Page cache',
        'concept: glue',
        'trust: not-ready',
        'empty_slot: needs a Decision',
        'work_state: draft',
        'activity: 2026-10-03T12:00:00.000Z draft',
      ])
    })

    it('shows the Part under review that a Part needs', async () => {
      await addPart(db, 'glue', {
        type: 'decision',
        title: 'Cache every page',
        date: '2026-02-01',
        owner: 'tim',
        status: 'proposed',
        needs: ['G1', 'R1'],
      })
      await addPart(db, 'glue', {
        type: 'flow',
        title: 'Read a cached page',
        needs: ['D2'],
      })

      await run('show', 'F1')

      expect(logged()).toEqual([
        'F1',
        'title: Read a cached page',
        'concept: glue',
        'needs: D2 Cache every page',
        'trust: not-ready',
        'under_review: decision D2 Cache every page',
        'work_state: draft',
        'activity: 2026-10-03T12:00:00.000Z draft',
      ])
    })

    it('shows a Goal with its measure and the last readings', async () => {
      await updatePart(db, 'glue', 'G1', {
        measure: {
          kind: 'mean',
          source: 'mock-analytics',
          event: 'survey',
          property: 'seq',
          target_change: 1,
          window_days: 7,
        },
      })
      await setReading(db, 'glue', 'G1', {
        baseline: 4.5,
        latestValue: 5.25,
        latestBreakdownValue: '1.2.0',
        measuredAt: new Date('2026-03-01T08:00:00Z'),
      })

      await run('show', 'G1')

      expect(logged()).toEqual([
        'G1',
        'title: Ship faster',
        'metric: lead time',
        'source: https://example.com/g1',
        'measure: {"kind":"mean","event":"survey","source":"mock-analytics","property":"seq","window_days":7,"target_change":1}',
        'status: open',
        'baseline: 4.5',
        'latestValue: 5.25',
        'latestBreakdownValue: 1.2.0',
        'measuredAt: 2026-03-01T08:00:00.000Z',
        'trust: not-ready',
        'work_state: draft',
        'target: 5.5',
        'value: 5.25',
        'on_target: false',
        'measured_at: 2026-03-01T08:00:00.000Z',
        'activity: 2026-10-03T12:00:00.000Z draft',
        '\nWhy the goal exists.',
      ])
    })

    it('shows a Goal without a measure', async () => {
      await run('show', 'G1')

      expect(logged()).toEqual([
        'G1',
        'title: Ship faster',
        'metric: lead time',
        'source: https://example.com/g1',
        'measure: null',
        'status: open',
        'baseline: null',
        'latestValue: null',
        'latestBreakdownValue: null',
        'measuredAt: null',
        'trust: not-ready',
        'work_state: draft',
        'activity: 2026-10-03T12:00:00.000Z draft',
        '\nWhy the goal exists.',
      ])
    })

    it('shows an Insight', async () => {
      await run('show', 'I1')

      expect(logged()).toEqual([
        'I1',
        'title: Users churn on slow loads',
        'date: 2026-01-01',
        'source: https://example.com/i1',
        'status: draft',
        'evidenceLevel: pattern',
        'trust: not-ready',
        'work_state: draft',
        'activity: 2026-10-03T12:00:00.000Z draft',
        '\nSeen in **three** interviews.',
      ])
    })

    it('shows a Guardrail', async () => {
      await run('show', 'R1')

      expect(logged()).toEqual([
        'R1',
        'title: No query over 200ms',
        'enforcedBy: none yet',
        'source: null',
        'trust: not-ready',
        'work_state: draft',
        'activity: 2026-10-03T12:00:00.000Z draft',
      ])
    })

    it('shows a Version of a Part as it was at its sign-off', async () => {
      await updatePart(db, 'glue', 'D1', { title: 'Cache the start page' })

      await run('show', 'D1', '--version', '1')

      expect(logged()).toEqual([
        'D1',
        'version: 1',
        'title: Cache the homepage',
        'status: accepted',
        'owner: tim',
        'date: 2026-01-02',
        'signed_at: 2026-10-03T12:00:00.000Z',
        '\nCache reads at the edge.',
      ])
    })

    it('says that the Part has no such Version', async () => {
      await expect(run('show', 'I1', '--version', '1')).rejects.toThrow(
        '"I1" has no Version 1',
      )
    })

    // F3 is the id of a Flow that the Project does not have.
    it.each(['F3', 'D9'])('throws for the id "%s"', async (id) => {
      await expect(run('show', id)).rejects.toThrow(`"${id}" not found`)
    })

    it('throws for an id that is not a Concept id', async () => {
      await expect(run('show', 'X1')).rejects.toThrow(
        '"X1" is not a Concept id',
      )
    })

    it('says that the Project is missing', async () => {
      await expect(run('show', 'D1', '--project', 'bakeday')).rejects.toThrow(
        'product "bakeday" not found',
      )
    })
  })
})
