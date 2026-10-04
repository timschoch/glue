import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { addPart, addProject, setReading } from '../src/db/part-records.ts'
import { findPart } from '../src/db/parts.ts'
import { setProductRepository } from '../src/db/projects.ts'
import * as schema from '../src/db/schema.ts'
import { createTestDatabase } from '../src/db/test-database.ts'
import { partFields } from '../src/part-fields.ts'
import type { PartField } from '../src/part-fields.ts'
import { createFakeGithub } from '../src/test/github.ts'
import {
  formatDownstreamIssue,
  main,
  parseFlags,
  runConcept,
} from './concept.ts'

describe('runConcept', () => {
  const { client, db } = createTestDatabase(schema)
  let fake: ReturnType<typeof createFakeGithub>

  const decisionFlags = [
    '--project',
    'flexibeck',
    '--title',
    'Check the types before the push',
    '--date',
    '2026-03-03',
    '--owner',
    'Ada',
    '--goal',
    'G1',
    '--evidence',
    'R1',
  ]

  function run(...args: string[]) {
    return runConcept(db, () => fake.github, args)
  }

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fake = createFakeGithub()
    await addProject(db, 'flexibeck')
    await addPart(db, 'flexibeck', {
      type: 'goal',
      title: 'Ship faster',
      metric: 'lead time',
      source: 'okr',
    })
    await addPart(db, 'flexibeck', {
      type: 'guardrail',
      title: 'CI takes ten minutes at most',
      enforcedBy: 'verify ci',
    })
    await setProductRepository(db, 'flexibeck', 'timschoch/flexibeck-next')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function showIssueUrl(id: string) {
    const part = await findPart(db, 'flexibeck', id)
    return part?.issueUrl ?? null
  }

  it('opens no issue for a Decision that it adds as proposed', async () => {
    await run('add', 'decisions', ...decisionFlags, '--status', 'proposed')

    expect(fake.issues).toEqual([])
  })

  it('opens the downstream issue when it sets a Decision to accepted', async () => {
    await run('add', 'decisions', ...decisionFlags, '--status', 'proposed')

    await run('set', 'D1', '--project', 'flexibeck', '--status', 'accepted')

    expect(fake.issues).toHaveLength(1)
    expect(await showIssueUrl('D1')).not.toBeNull()
  })

  it('opens the downstream issue of a Decision that supersedes another one', async () => {
    await run('add', 'decisions', ...decisionFlags, '--status', 'accepted')

    await run(
      'add',
      'decisions',
      ...decisionFlags,
      '--status',
      'accepted',
      '--supersedes',
      'D1',
    )

    expect(fake.issues).toHaveLength(2)
    expect(await showIssueUrl('D2')).not.toBeNull()
    expect((await findPart(db, 'flexibeck', 'D1'))?.supersededBy?.id).toBe('D2')
  })

  it('closes a Goal as achieved', async () => {
    await run('set', 'G1', '--project', 'flexibeck', '--status', 'achieved')

    const goal = await findPart(db, 'flexibeck', 'G1')
    expect(goal?.status).toBe('achieved')
  })

  it('shows the measure of a Goal as JSON', async () => {
    const measure = {
      kind: 'mean',
      source: 'mock-analytics',
      event: 'survey sent',
      property: '$survey_response',
      target_change: 1,
      window_days: 7,
    }
    await run(
      'set',
      'G1',
      '--project',
      'flexibeck',
      '--measure',
      JSON.stringify(measure),
    )

    await run('show', 'G1', '--project', 'flexibeck')

    const lines: string[] = vi
      .mocked(console.log)
      .mock.calls.map(([line]) => line)
    const measureLine = lines.find((line) => line.startsWith('measure: '))
    expect(JSON.parse(measureLine?.slice('measure: '.length) ?? '')).toEqual(
      measure,
    )
    expect(lines).toContain('status: open')
    expect(lines).toContain('baseline: null')
  })
  it('sets the social handle of a Product, and an empty handle removes it', async () => {
    const findHandle = async () => {
      const [row] = await db
        .select({ handle: schema.projects.socialHandle })
        .from(schema.projects)
        .where(eq(schema.projects.slug, 'flexibeck'))
      return row.handle
    }

    await run('project', 'set', 'flexibeck', '--social-handle', 'flexibeck')
    const handle = await findHandle()
    await run('project', 'set', 'flexibeck', '--social-handle', '')

    expect(handle).toBe('flexibeck')
    expect(await findHandle()).toBeNull()
  })

  it('rejects the old product command and names project set', async () => {
    await expect(
      run('product', 'set', 'flexibeck', '--social-handle', 'flexibeck'),
    ).rejects.toThrow('"product" is gone: use "pnpm concept project set"')
  })

  it('refuses to add a Fact: a Fact is no type', async () => {
    await expect(
      run(
        'add',
        'facts',
        '--project',
        'flexibeck',
        '--title',
        'CI takes ten minutes',
        '--source',
        'verify ci',
      ),
    ).rejects.toThrow('"facts" is not a Concept type')
  })

  function logged(): string[] {
    return vi.mocked(console.log).mock.calls.map(([line]) => line)
  }

  const insightFlags = [
    '--project',
    'flexibeck',
    '--title',
    'Lists load in 3 seconds',
    '--source',
    'analytics',
  ]

  it('adds an Insight with its Evidence level, and shows the level', async () => {
    await run('add', 'insights', ...insightFlags, '--level', 'confirmed')

    await run('show', 'I1', '--project', 'flexibeck')

    expect(logged()).toContain('evidenceLevel: confirmed')
  })

  it('refuses an Evidence level that is no level, and names the levels', async () => {
    await expect(
      run('add', 'insights', ...insightFlags, '--level', 'observed'),
    ).rejects.toThrow(/"hunch".*"pattern".*"confirmed"/)
  })

  it('refuses an Insight status other than draft, and names draft', async () => {
    await expect(
      run('add', 'insights', ...insightFlags, '--status', 'confirmed'),
    ).rejects.toThrow('"draft"')

    await run('list', 'insights', '--project', 'flexibeck')
    expect(logged()).toEqual([])
  })

  it('adds a draft Insight', async () => {
    await run('add', 'insights', ...insightFlags, '--status', 'draft')

    await run('list', 'insights', '--project', 'flexibeck')

    expect(logged()).toEqual([
      'I1',
      'I1  draft  not-ready  draft  Lists load in 3 seconds',
    ])
  })

  it('clears the status of a draft Insight with an empty status', async () => {
    await run('add', 'insights', ...insightFlags, '--status', 'draft')

    await run('set', 'I1', '--project', 'flexibeck', '--status', '')

    const insight = await findPart(db, 'flexibeck', 'I1')
    expect(insight?.status).toBeNull()
  })

  it('refuses to clear a field that the type needs', async () => {
    await expect(
      run('set', 'R1', '--project', 'flexibeck', '--title', ''),
    ).rejects.toThrow('title')
  })

  it.each([
    ['I1', '"draft"'],
    ['G1', /"open".*"achieved"/],
    ['D1', /proposed.*accepted/],
  ])(
    'refuses a status that %s does not have, and names the right ones',
    async (id, statuses) => {
      await run('add', 'insights', ...insightFlags)
      await run('add', 'decisions', ...decisionFlags, '--status', 'proposed')

      await expect(
        run('set', id, '--project', 'flexibeck', '--status', 'confirmed'),
      ).rejects.toThrow(statuses)
    },
  )

  it('shows the source of a Guardrail', async () => {
    await run(
      'add',
      'guardrails',
      '--project',
      'flexibeck',
      '--title',
      'No query over 200ms',
      '--enforced-by',
      'monitoring',
      '--source',
      'the hosting contract',
    )

    await run('show', 'R2', '--project', 'flexibeck')

    expect(logged()).toContain('source: the hosting contract')
  })

  it('changes the fields of a Guardrail that the flags name', async () => {
    await run(
      'set',
      'R1',
      '--project',
      'flexibeck',
      '--title',
      'CI takes five minutes at most',
      '--enforced-by',
      'the CI budget',
      '--body',
      'D32 halved the budget.',
    )

    const guardrail = await findPart(db, 'flexibeck', 'R1')
    expect(guardrail).toMatchObject({
      title: 'CI takes five minutes at most',
      enforcedBy: 'the CI budget',
      body: 'D32 halved the budget.',
    })
  })

  it('refuses a flag that the type of the record does not have', async () => {
    await expect(
      run('set', 'R1', '--project', 'flexibeck', '--level', 'confirmed'),
    ).rejects.toThrow('evidenceLevel')
  })

  it('adds a Decision that needs another Decision, and shows it', async () => {
    await run('add', 'decisions', ...decisionFlags, '--status', 'proposed')

    await run(
      'add',
      'decisions',
      ...decisionFlags,
      '--status',
      'proposed',
      '--needs',
      'D1',
    )
    await run('show', 'D2', '--project', 'flexibeck')

    expect(logged()).toContain('needs: D1 Check the types before the push')
    expect(logged()).toContain('evidence: R1 CI takes ten minutes at most')
  })

  it.each([
    ['entities', 'E1'],
    ['flows', 'F1'],
    ['metrics', 'M1'],
  ])('adds to the %s, lists and shows %s', async (folder, recordId) => {
    await run(
      'add',
      folder,
      '--project',
      'flexibeck',
      '--title',
      'Build time',
      '--owner',
      'Ada',
      '--needs',
      'R1',
      '--body',
      'From the push to the green check.',
    )
    await run('list', folder, '--project', 'flexibeck')
    await run('show', recordId, '--project', 'flexibeck')

    expect(logged()).toEqual([
      recordId,
      `${recordId}  not-ready  draft  Build time`,
      recordId,
      'title: Build time',
      'owner: Ada',
      'concept: flexibeck',
      'needs: R1 CI takes ten minutes at most',
      'trust: not-ready',
      'work_state: draft',
      expect.stringMatching(/^activity: \S+ changed$/),
      '\nFrom the push to the green check.',
    ])
  })

  it('lists the Entities, Flows and Metrics after the other records', async () => {
    await run('add', 'flows', '--project', 'flexibeck', '--title', 'Push')

    await run('list', '--project', 'flexibeck')

    expect(logged().slice(1)).toEqual([
      'G1  open  not-ready  draft  Ship faster',
      'R1  not-ready  draft  CI takes ten minutes at most',
      'F1  not-ready  draft  Push',
    ])
  })

  it('adds a Metric with its measure', async () => {
    const measure = {
      kind: 'mean',
      source: 'mock-analytics',
      event: 'survey sent',
      property: '$survey_response',
      target_change: 1,
      window_days: 7,
    }
    await run(
      'add',
      'metrics',
      '--project',
      'flexibeck',
      '--title',
      'Ease of the first build',
      '--measure',
      JSON.stringify(measure),
    )

    await run('show', 'M1', '--project', 'flexibeck')

    const line = logged().find((shown) => shown.startsWith('measure: '))
    expect(JSON.parse(line?.slice('measure: '.length) ?? '')).toEqual(measure)
  })

  it('shows the newest reading of a Metric against its target', async () => {
    const measure = {
      kind: 'funnel',
      source: 'mock-analytics',
      steps: ['signed-up', 'paid'],
      target: 0.25,
      window_days: 7,
    }
    await run(
      'add',
      'metrics',
      '--project',
      'flexibeck',
      '--title',
      'Signup to paid',
      '--measure',
      JSON.stringify(measure),
    )
    await setReading(db, 'flexibeck', 'M1', {
      baseline: null,
      latestValue: 0.1,
      latestBreakdownValue: null,
      measuredAt: new Date('2026-10-04T00:00:00.000Z'),
    })

    await run('show', 'M1', '--project', 'flexibeck')

    expect(logged()).toEqual(
      expect.arrayContaining([
        'target: 0.25',
        'value: 0.1',
        'on_target: false',
        'measured_at: 2026-10-04T00:00:00.000Z',
      ]),
    )
  })

  it('refuses a flag that an Entity does not have', async () => {
    await expect(
      run(
        'add',
        'entities',
        '--project',
        'flexibeck',
        '--title',
        'Cart',
        '--enforced-by',
        'CI',
      ),
    ).rejects.toThrow('enforcedBy')
  })

  it('adds a Concept, and a Part with its home there', async () => {
    await run(
      'concept',
      'add',
      'checkout',
      '--project',
      'flexibeck',
      '--title',
      'Checkout',
      '--kind',
      'brief',
    )
    await run(
      'add',
      'flows',
      '--project',
      'flexibeck',
      '--title',
      'Pay the cart',
      '--concept',
      'checkout',
    )

    await run('show', 'F1', '--project', 'flexibeck')

    expect(logged()).toContain('checkout')
    expect(logged()).toContain('concept: checkout')
  })

  it('refuses a Concept without a title', async () => {
    await expect(
      run('concept', 'add', 'checkout', '--project', 'flexibeck'),
    ).rejects.toThrow('title')
  })

  it('glues two Parts with a Joint, then removes the Joint', async () => {
    await run('add', 'flows', '--project', 'flexibeck', '--title', 'Push')

    await run('joint', 'add', 'F1', 'R1', '--project', 'flexibeck')
    await run('show', 'F1', '--project', 'flexibeck')
    const glued = logged()
    await run('joint', 'remove', 'F1', 'R1', '--project', 'flexibeck')
    vi.mocked(console.log).mockClear()
    await run('show', 'F1', '--project', 'flexibeck')

    expect(glued).toContain('needs: R1 CI takes ten minutes at most')
    expect(logged()).toEqual([
      'F1',
      'title: Push',
      'concept: flexibeck',
      'trust: not-ready',
      'work_state: draft',
      expect.stringMatching(/^activity: \S+ changed$/),
    ])
  })

  it('glues two Parts that need each other', async () => {
    await run('add', 'flows', '--project', 'flexibeck', '--title', 'Push')
    await run('add', 'entities', '--project', 'flexibeck', '--title', 'Branch')

    await run('joint', 'add', 'F1', 'E1', '--two-way', '--project', 'flexibeck')
    await run('show', 'E1', '--project', 'flexibeck')

    expect(logged()).toContain('needs: F1 Push')
  })

  it('says that two Parts have no Joint to remove', async () => {
    await expect(
      run('joint', 'remove', 'G1', 'R1', '--project', 'flexibeck'),
    ).rejects.toThrow('"G1" and "R1" have no Joint')
  })

  it('adds a Project with its root Concept', async () => {
    await run('project', 'add', 'design-system')
    await run(
      'add',
      'entities',
      '--project',
      'design-system',
      '--title',
      'Token',
    )

    await run('show', 'E1', '--project', 'design-system')

    expect(logged()).toContain('concept: design-system')
  })

  it('shows the Trust and the Work state of a Goal', async () => {
    await run('show', 'G1', '--project', 'flexibeck')

    expect(logged()).toEqual(
      expect.arrayContaining(['trust: not-ready', 'work_state: draft']),
    )
  })

  it('answers a Part, and lists what needs the owner', async () => {
    await run('answer', 'R1', 'supersede', '--project', 'flexibeck')

    await run('mine', '--project', 'flexibeck')

    expect(logged()).toEqual(['G1  open  not-ready  draft  Ship faster'])
  })

  it('adds members, assigns a record and a Concept, and lists what a member has', async () => {
    const project = ['--project', 'flexibeck']
    await client.exec(`
      create schema neon_auth;
      create table neon_auth."user" (id uuid primary key, name text not null, email text not null);
      insert into neon_auth."user" (id, name, email) values
        ('00000000-0000-0000-0000-000000000001', 'Ada', 'ada@example.com'),
        ('00000000-0000-0000-0000-000000000002', 'Bo', 'bo@example.com');
    `)

    await run('member', 'add', 'ada@example.com', ...project)
    await run('member', 'add', 'bo@example.com', ...project)
    await run('assign', 'G1', '--responsible', 'ada@example.com', ...project)
    await run('assign', 'G1', '--co-author', 'bo@example.com', ...project)
    await run('assign', 'R1', '--responsible', 'bo@example.com', ...project)
    await run(
      'assign',
      'flexibeck',
      '--co-author',
      'ada@example.com',
      ...project,
    )
    vi.mocked(console.log).mockClear()
    await run('member', 'list', ...project)
    await run('mine', '--member', 'ada@example.com', ...project)

    expect(logged()).toEqual([
      'Ada  ada@example.com  responsible: G1  co-author: flexibeck',
      'Bo  bo@example.com  responsible: R1  co-author: G1',
      'G1  open  not-ready  draft  Ship faster',
    ])
  })

  it('refuses an assign without a member', async () => {
    await expect(run('assign', 'G1', '--project', 'flexibeck')).rejects.toThrow(
      'assign needs --responsible <e-mail> or --co-author <e-mail>',
    )
  })

  it('makes a flagged Part wait, and shows its flag and the Part that it waits on', async () => {
    const project = ['--project', 'flexibeck']
    await run('answer', 'R1', 'supersede', ...project)
    await run('add', 'flows', ...project, '--title', 'Push', '--needs', 'R1')
    await run('answer', 'F1', 'supersede', ...project)
    await run('set', 'R1', ...project, '--title', 'CI takes five minutes')

    await run('answer', 'F1', 'wait', '--waits-on', 'R1', ...project)
    vi.mocked(console.log).mockClear()
    await run('show', 'F1', ...project)

    expect(logged()).toEqual([
      'F1',
      'title: Push',
      'concept: flexibeck',
      'needs: R1 CI takes five minutes',
      'trust: flagged',
      'work_state: waiting',
      expect.stringMatching(
        /^flag: R1 changed \d{4}-\d{2}-\d{2} CI takes five minutes$/,
      ),
      'waits_on: R1 CI takes five minutes',
      expect.stringMatching(/^activity: \S+ changed$/),
      expect.stringMatching(/^activity: \S+ flag-opened R1 changed$/),
      expect.stringMatching(/^activity: \S+ published$/),
    ])
  })

  it('refuses an answer that the Work state does not take, and names the ones that it takes', async () => {
    await expect(
      run('answer', 'G1', 'fine', '--project', 'flexibeck'),
    ).rejects.toThrow(
      '"G1" is draft: it takes the answers supersede, not-ready, sink',
    )
  })

  it('names the issue that the answer to a Decision opened', async () => {
    await run('add', 'decisions', ...decisionFlags, '--status', 'proposed')

    await run('answer', 'D1', 'supersede', '--project', 'flexibeck')

    expect(console.error).toHaveBeenLastCalledWith(
      'issue: https://github.com/timschoch/flexibeck-next/issues/1',
    )
  })

  it('refuses an answer to a Part that does not exist, and names the Part', async () => {
    await expect(
      run('answer', 'I9', 'sink', '--project', 'flexibeck'),
    ).rejects.toThrow('insight "I9" not found')
  })

  it('puts an answer in words at the end of the body, with the name', async () => {
    await run('add', 'decisions', ...decisionFlags, '--status', 'proposed')

    await run(
      'answer',
      'D1',
      'sink',
      '--words',
      'Too slow',
      '--by',
      'Ada',
      '--project',
      'flexibeck',
    )

    const record = await findPart(db, 'flexibeck', 'D1')
    expect(record?.body).toMatch(/^Ada, \d{4}-\d{2}-\d{2}: Too slow$/)
  })

  describe('a Decision with options', () => {
    const questionFlags = [
      ...decisionFlags,
      '--status',
      'proposed',
      '--option',
      'Cache it',
      '--option',
      'Render on the edge',
      '--option',
      'Do nothing',
      '--pick',
      '2',
    ]

    function listPrinted() {
      return vi.mocked(console.log).mock.calls.map(([line]) => String(line))
    }

    it('shows its options in their order, with the pick of the author', async () => {
      await run('add', 'decisions', ...questionFlags)

      await run('show', 'D1', '--project', 'flexibeck')

      expect(listPrinted()).toEqual(
        expect.arrayContaining([
          'option: 1 Cache it',
          'option: 2 Render on the edge (pick)',
          'option: 3 Do nothing',
        ]),
      )
    })

    it('takes an option as the answer, accepts the Decision and opens its issue', async () => {
      await run('add', 'decisions', ...questionFlags)

      await run(
        'answer',
        'D1',
        '--option',
        '3',
        '--by',
        'Ada',
        '--project',
        'flexibeck',
      )
      await run('show', 'D1', '--project', 'flexibeck')

      const printed = listPrinted()
      expect(printed).toContain('status: accepted')
      expect(printed).toContainEqual(
        expect.stringMatching(/^answer: option 3, Ada, \d{4}-\d{2}-\d{2}$/),
      )
      expect(fake.issues).toHaveLength(1)
    })

    it('takes an answer in words', async () => {
      await run('add', 'decisions', ...questionFlags)

      await run(
        'answer',
        'D1',
        '--text',
        'Buy a CDN',
        '--by',
        'Ada',
        '--project',
        'flexibeck',
      )
      await run('show', 'D1', '--project', 'flexibeck')

      expect(listPrinted()).toContainEqual(
        expect.stringMatching(/^answer: Buy a CDN, Ada, \d{4}-\d{2}-\d{2}$/),
      )
    })

    it('shows a superseded Decision that was never accepted as not chosen', async () => {
      await run('add', 'decisions', ...questionFlags)
      await run('add', 'decisions', ...decisionFlags, '--status', 'accepted')
      await run(
        'set',
        'D1',
        '--status',
        'superseded',
        '--superseded-by',
        'D2',
        '--project',
        'flexibeck',
      )

      await run('show', 'D1', '--project', 'flexibeck')

      expect(listPrinted()).toContain('outcome: not chosen')
    })
  })

  it('rejects an unknown command and points to the help', async () => {
    await expect(run('lst')).rejects.toThrow(
      'unknown command "lst". See pnpm concept --help',
    )
  })
})

describe('main', () => {
  const printHelp = async (...args: string[]) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await main(args, undefined)
    const lines: string[] = log.mock.calls.map(([line]) => line)
    vi.restoreAllMocks()
    return lines.join('\n')
  }

  it('prints every command when it gets no command', async () => {
    const help = await printHelp()

    for (const command of [
      'list [<type>]',
      'show <id>',
      'add <type>',
      'set <id>',
      'downstream <id>',
      'project set <slug>',
      'project add <slug>',
      'concept add <slug>',
      'joint add <id> <needed id>',
      'joint remove <id> <needed id>',
      'token create',
      'token list',
      'token revoke <id>',
    ]) {
      expect(help).toContain(`pnpm concept ${command}`)
    }
  })

  it('prints the flags, and the fields that each type needs', async () => {
    const help = await printHelp('--help')

    expect(help).toContain('--project <slug>')
    expect(help).toContain(
      'decisions: --title --date --owner --status --goal --evidence',
    )
    expect(help).toContain('goals: --title --metric --source')
    expect(help).toContain('insights: --title --date --source')
    expect(help).toContain('guardrails: --title --enforced-by')
    expect(help).not.toContain('facts:')
    expect(help).toContain('entities, flows, metrics: --title')
    expect(help).toContain('--level hunch|pattern|confirmed')
  })

  it('prints the help for --help after a command', async () => {
    expect(await printHelp('add', '--help')).toContain('pnpm concept list')
  })

  it('needs DATABASE_URL for a command', async () => {
    await expect(main(['list'], undefined)).rejects.toThrow(
      'DATABASE_URL is required',
    )
  })
})

describe('parseFlags', () => {
  it.each(Object.entries(partFields))(
    'knows a flag for each field of the type %s',
    (_, fields: ReadonlyArray<PartField>) => {
      const unknown = fields
        .map(({ name, flag = name }) => `--${flag}`)
        .filter((flag) => {
          try {
            parseFlags([flag, '{}'])
            return false
          } catch (error) {
            return String(error).includes('unknown flag')
          }
        })

      expect(unknown).toEqual([])
    },
  )

  it('parses a flag into its field', () => {
    expect(parseFlags(['--title', 'Ship faster'])).toEqual({
      title: 'Ship faster',
    })
  })

  it('maps a kebab-case flag to its snake_case field', () => {
    expect(parseFlags(['--enforced-by', 'none yet'])).toEqual({
      enforced_by: 'none yet',
    })
    expect(parseFlags(['--superseded-by', 'D2'])).toEqual({
      superseded_by: 'D2',
    })
  })

  it('parses the Decision that a new Decision supersedes', () => {
    expect(parseFlags(['--supersedes', 'D1'])).toEqual({ supersedes: 'D1' })
  })

  it('splits --evidence on commas', () => {
    expect(parseFlags(['--evidence', 'I1,F1'])).toEqual({
      evidence: ['I1', 'F1'],
    })
  })

  it('parses the --name of a token', () => {
    expect(parseFlags(['--project', 'flexibeck', '--name', 'bot'])).toEqual({
      project: 'flexibeck',
      name: 'bot',
    })
  })

  it('parses the --analytics-project of a Product', () => {
    expect(parseFlags(['--analytics-project', 'phc_demo'])).toEqual({
      analytics_project: 'phc_demo',
    })
  })

  it('parses --measure as the JSON of a Goal measure', () => {
    const measure = {
      kind: 'funnel',
      source: 'mock-analytics',
      steps: ['signed-up', 'paid'],
      target: 0.25,
      window_days: 7,
    }

    expect(parseFlags(['--measure', JSON.stringify(measure)])).toEqual({
      measure,
    })
  })

  it('rejects a --measure that is not JSON', () => {
    expect(() => parseFlags(['--measure', '{target: 1}'])).toThrow(
      /"--measure" must be JSON/,
    )
  })

  it('rejects a --measure without its steps', () => {
    const measure = { kind: 'funnel', source: 'mock-analytics', target: 0.25 }

    expect(() => parseFlags(['--measure', JSON.stringify(measure)])).toThrow(
      /steps/,
    )
  })

  it('parses the --repository of a Product', () => {
    expect(parseFlags(['--repository', 'timschoch/glue'])).toEqual({
      repository: 'timschoch/glue',
    })
  })

  it('rejects the old --product and names --project', () => {
    expect(() => parseFlags(['--product', 'flexibeck'])).toThrow(
      '"--product" is gone: use "--project"',
    )
  })

  it('rejects an unknown flag', () => {
    expect(() => parseFlags(['--titel', 'x'])).toThrow(/unknown flag "--titel"/)
  })

  it.each(['issue', 'issueUrl', 'issue-url'])(
    'rejects the flag --%s: Glue sets the issue of a Decision',
    (flag) => {
      expect(() => parseFlags([`--${flag}`, 'x'])).toThrow(
        `unknown flag "--${flag}"`,
      )
    },
  )

  it('rejects a flag with no value', () => {
    expect(() => parseFlags(['--evidence'])).toThrow(
      /"--evidence" needs a value/,
    )
  })
})

describe('formatDownstreamIssue', () => {
  it('names the issue that was opened', () => {
    expect(
      formatDownstreamIssue('flexibeck', 'D2', {
        kind: 'created',
        url: 'https://github.com/timschoch/glue/issues/9',
      }),
    ).toBe('issue: https://github.com/timschoch/glue/issues/9')
  })

  it('says the issue is missing and how to retry', () => {
    expect(
      formatDownstreamIssue('flexibeck', 'D2', {
        kind: 'failed',
        message: 'GitHub create issue: 403',
      }),
    ).toBe(
      'issue missing: GitHub create issue: 403\nRetry: pnpm concept downstream D2 --project flexibeck',
    )
  })

  it('says why no issue was opened', () => {
    expect(
      formatDownstreamIssue('flexibeck', 'D2', { kind: 'no-repository' }),
    ).toBe('no issue: the Product has no repository')
    expect(
      formatDownstreamIssue('flexibeck', 'D2', { kind: 'not-accepted' }),
    ).toBe('no issue: D2 is not accepted')
  })
})
