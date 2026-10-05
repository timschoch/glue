import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'

import * as schema from '../src/db/schema.ts'
import { createTestDatabase } from '../src/db/test-database.ts'
import { createFakeGithub } from '../src/test/github.ts'
import { runConcept } from './concept.ts'

describe('pnpm concept contract', () => {
  const { db } = createTestDatabase(schema)
  let printed: MockInstance<typeof console.log>

  function run(...args: string[]) {
    return runConcept(db, () => createFakeGithub().github, args)
  }

  function listPrinted() {
    return printed.mock.calls.map(([line]) => String(line))
  }

  // The Brief `videos` of glue has the Insight I1 and the Flow F1. The Flow
  // starts as a draft.
  beforeEach(async () => {
    printed = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await run('project', 'add', 'glue')
    await run(
      'concept',
      'add',
      'videos',
      '--title',
      'Videos',
      '--kind',
      'brief',
    )
    await run(
      'add',
      'insights',
      '--title',
      'Bakers want step videos',
      '--date',
      '2026-10-01',
      '--source',
      'interview',
      '--concept',
      'videos',
    )
    await run(
      'add',
      'flows',
      '--title',
      'Watch a technique',
      '--concept',
      'videos',
    )
    printed.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sign names the Parts that block', async () => {
    await expect(
      run('contract', 'sign', 'videos', '--owner', 'Tim'),
    ).rejects.toThrow('sign-off needs Trust solid: F1')
  })

  it('sign needs --owner: who signs off', async () => {
    await expect(run('contract', 'sign', 'videos')).rejects.toThrow(
      'contract sign needs <concept> and --owner',
    )
  })

  it('sign prints the Concept with its new Version, and show prints tier 1 first', async () => {
    await run('answer', 'F1', 'supersede')

    await run('contract', 'sign', 'videos', '--owner', 'Tim')

    expect(listPrinted()).toEqual(['videos@1'])
    printed.mockClear()

    await run('contract', 'show', 'videos')

    const lines = listPrinted()
    expect(lines[0]).toBe('videos@1')
    expect(lines[1]).toMatch(/^checksum: [0-9a-f]{64}$/)
    expect(lines[2]).toMatch(/^signed: Tim \d{4}-\d{2}-\d{2}$/)
    expect(lines.slice(3)).toEqual([
      'empty slots: goal, decision, metric, entity, guardrail',
      'tier 1',
      'F1  flow  Watch a technique',
      'tier 2',
      'I1  insight  Bakers want step videos',
    ])
  })

  it('show --version prints an older Version and says that it is superseded', async () => {
    await run('answer', 'F1', 'supersede')
    await run('contract', 'sign', 'videos', '--owner', 'Tim')
    await run('set', 'F1', '--title', 'Watch a step')
    await run('contract', 'sign', 'videos', '--owner', 'Tim')
    printed.mockClear()

    await run('contract', 'show', 'videos', '--version', '1')

    const lines = listPrinted()
    expect(lines[0]).toBe('videos@1')
    expect(lines).toContain('superseded_by: videos@2')
    expect(lines).toContain('F1  flow  Watch a technique')
  })

  it('show prints the Version of a Joint and what a new Version changed, and answer moves the Joint to it', async () => {
    await run('answer', 'F1', 'supersede')
    await run('contract', 'sign', 'videos', '--owner', 'Tim')
    await run('concept', 'add', 'shop', '--title', 'Shop')
    await run(
      'add',
      'flows',
      '--title',
      'Buy a course',
      '--concept',
      'shop',
      '--needs',
      'F1',
    )
    await run('answer', 'F2', 'supersede')
    await run('set', 'F1', '--title', 'Watch a step')
    await run('contract', 'sign', 'videos', '--owner', 'Tim')
    printed.mockClear()

    await run('show', 'F2')

    expect(listPrinted()).toEqual(
      expect.arrayContaining([
        'needs: F1 version 1 Watch a step',
        expect.stringMatching(
          /^flag: F1 new-version \d{4}-\d{2}-\d{2} Watch a step$/,
        ),
        'version: F1 1 -> 2',
        'change: F1 title: Watch a technique -> Watch a step',
      ]),
    )
    printed.mockClear()

    await run(
      'answer',
      'F2',
      'move-to-version',
      '--needs',
      'F1',
      '--version',
      '2',
    )
    await run('show', 'F2')

    const lines = listPrinted()
    expect(lines).toContain('needs: F1 version 2 Watch a step')
    expect(lines.filter((line) => line.includes('new-version'))).toEqual([
      expect.stringMatching(/^activity: \S+ flag-closed F1 new-version$/),
      expect.stringMatching(/^activity: \S+ flag-opened F1 new-version$/),
    ])
  })

  it('show fails for a Concept without a Contract Version', async () => {
    await expect(run('contract', 'show', 'videos')).rejects.toThrow(
      '"videos" has no Contract Version',
    )
  })
})
