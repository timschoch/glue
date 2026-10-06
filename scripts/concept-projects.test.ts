import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'

import {
  addJoint,
  addPart,
  addProject,
  answerPart,
} from '../src/db/part-records.ts'
import { findPart } from '../src/db/parts.ts'
import * as schema from '../src/db/schema.ts'
import { createTestDatabase } from '../src/db/test-database.ts'
import { createFakeGithub } from '../src/test/github.ts'
import { runConcept } from './concept.ts'

// `pnpm concept` across the edge of a Project: its own job is to read the
// flags and to print. The rules have their tests at the Part operations.
describe('runConcept across Projects', () => {
  const { db } = createTestDatabase(schema)
  let log: MockInstance<typeof console.log>

  function run(...args: string[]) {
    return runConcept(db, () => createFakeGithub([]).github, args)
  }

  // Project `glue` has the published Flow F1, and F1 needs the Insight I1.
  beforeEach(async () => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('GLUE_PROJECT', undefined)
    await addProject(db, 'glue', 'Glue')
    await addPart(db, 'glue', { type: 'flow', title: 'Sign off a Version' })
    await answerPart(db, 'glue', 'F1', { answer: 'supersede' })
    await addPart(db, 'glue', {
      type: 'insight',
      title: 'The gate is slow',
      source: 'ci',
    })
    await addJoint(db, 'glue', { part: 'F1', needs: 'I1' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  function printed() {
    return log.mock.calls.map(([line]) => line)
  }

  it('moves Parts to the Project of --to-project', async () => {
    await run('project', 'add', 'glue-build')

    await run(
      'move',
      'F1',
      'I1',
      '--project',
      'glue',
      '--to-project',
      'glue-build',
      '--concept',
      'glue-build',
    )

    const moved = await findPart(db, 'glue-build', 'F1')
    expect(moved?.needs.map((end) => end.part.id)).toEqual(['I1'])
    expect(await findPart(db, 'glue', 'F1')).toBeUndefined()
    expect(printed()).toEqual([])
  })

  it('prints each Joint that a move with --drop-refused-joints drops', async () => {
    await run('project', 'add', 'glue-build')

    await run(
      'move',
      'F1',
      '--drop-refused-joints',
      '--project',
      'glue',
      '--to-project',
      'glue-build',
      '--concept',
      'glue-build',
    )

    expect(printed()).toEqual(['dropped: glue-build/F1 needs glue/I1'])
  })

  it('adds, shows and removes a reference as <project>/<record id>', async () => {
    await addPart(db, 'glue', {
      type: 'goal',
      title: 'Ship faster',
      metric: 'lead time',
      source: 'okr',
    })
    await addPart(db, 'glue', {
      type: 'decision',
      title: 'Sign off each Version',
      owner: 'Tim',
      date: '2026-10-02',
      status: 'accepted',
      needs: ['G1', 'I1'],
    })
    await addJoint(db, 'glue', { part: 'F1', needs: 'D1' })
    await run('project', 'add', 'glue-build')
    await run('project', 'set', 'glue-build', '--references', 'glue')
    await run(
      'add',
      'flows',
      '--title',
      'Merge gate',
      '--project',
      'glue-build',
    )
    log.mockClear()

    await run('joint', 'add', 'F1', 'glue/F1', '--project', 'glue-build')
    await run('show', 'F1', '--project', 'glue-build')

    expect(printed()).toContain('needs: glue/F1 solid Sign off a Version')

    await run('joint', 'remove', 'F1', 'glue/F1', '--project', 'glue-build')

    expect((await findPart(db, 'glue-build', 'F1'))?.needs).toEqual([])
  })

  it('takes Project glue when the build Project does not exist', async () => {
    await run('add', 'flows', '--title', 'Merge gate')

    expect((await findPart(db, 'glue', 'F2'))?.title).toBe('Merge gate')
  })

  it('takes Project glue-build when it exists', async () => {
    await run('project', 'add', 'glue-build')

    await run('add', 'flows', '--title', 'Merge gate')

    expect((await findPart(db, 'glue-build', 'F1'))?.title).toBe('Merge gate')
  })

  it('takes the Project of GLUE_PROJECT', async () => {
    await run('project', 'add', 'glue-build')
    await run('project', 'add', 'flexibeck')
    vi.stubEnv('GLUE_PROJECT', 'flexibeck')

    await run('add', 'flows', '--title', 'Order bread')

    expect((await findPart(db, 'flexibeck', 'F1'))?.title).toBe('Order bread')
  })
})
