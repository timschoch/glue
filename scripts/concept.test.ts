import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addConceptRecord,
  setProductRepository,
  showConceptRecord,
} from '../src/db/concept-records.ts'
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
    'F1',
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
      'facts',
      { title: 'CI takes ten minutes', source: 'verify ci' },
      '',
    )
    await setProductRepository(db, 'flexibeck', 'timschoch/flexibeck-next')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await client.close()
  })

  async function showIssueUrl(id: string) {
    const [row] = await db
      .select({ issueUrl: schema.decisions.issueUrl })
      .from(schema.decisions)
      .where(eq(schema.decisions.recordId, id))
    return row.issueUrl
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
