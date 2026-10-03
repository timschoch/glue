import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addConceptRecord,
  setProductRepository,
} from '../src/db/concept-records.ts'
import { showConceptRecord } from '../src/db/legacy-records.ts'
import * as schema from '../src/db/schema.ts'
import { createFakeGithub } from '../src/test/github.ts'
import {
  formatDownstreamIssue,
  main,
  parseFlags,
  runConcept,
} from './concept.ts'

describe('runConcept', () => {
  let client: PGlite
  let db: ReturnType<typeof drizzle<typeof schema>>
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
    client = new PGlite()
    db = drizzle(client, { schema })
    await migrate(db, { migrationsFolder: './drizzle' })
    await addConceptRecord(
      db,
      'flexibeck',
      'goals',
      { title: 'Ship faster', metric: 'lead time', source: 'okr' },
      '',
    )
    await addConceptRecord(
      db,
      'flexibeck',
      'guardrails',
      { title: 'CI takes ten minutes at most', enforced_by: 'verify ci' },
      '',
    )
    await setProductRepository(db, 'flexibeck', 'timschoch/flexibeck-next')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await client.close()
  })

  async function showIssueUrl(id: string) {
    const record = await showConceptRecord(db, 'flexibeck', id)
    return record.fields.issue ?? null
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
    expect((await showConceptRecord(db, 'flexibeck', 'D1')).supersededBy).toBe(
      'D2',
    )
  })

  it('closes a Goal as achieved', async () => {
    await run('set', 'G1', '--project', 'flexibeck', '--status', 'achieved')

    const goal = await showConceptRecord(db, 'flexibeck', 'G1')
    expect(goal.fields.status).toBe('achieved')
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

  it('refuses to add a Fact and names the types to add instead', async () => {
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
    ).rejects.toThrow(
      'Fact is no longer a type (D26): add an Insight or a Guardrail.',
    )
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

    expect(logged()).toEqual(['I1', 'I1  draft  Lists load in 3 seconds'])
  })

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

    const guardrail = await showConceptRecord(db, 'flexibeck', 'R1')
    expect(guardrail.fields).toMatchObject({
      title: 'CI takes five minutes at most',
      enforcedBy: 'the CI budget',
    })
    expect(guardrail.body).toBe('D32 halved the budget.')
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
      `${recordId}  Build time`,
      recordId,
      'title: Build time',
      'owner: Ada',
      'concept: flexibeck',
      'needs: R1 CI takes ten minutes at most',
      '\nFrom the push to the green check.',
    ])
  })

  it('lists the Entities, Flows and Metrics after the other records', async () => {
    await run('add', 'flows', '--project', 'flexibeck', '--title', 'Push')

    await run('list', '--project', 'flexibeck')

    expect(logged().slice(1)).toEqual([
      'G1  open  Ship faster',
      'R1  CI takes ten minutes at most',
      'F1  Push',
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
    expect(logged()).toEqual(['F1', 'title: Push', 'concept: flexibeck'])
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
