import { join } from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../src/db/schema.ts'
import {
  addInsights,
  extractFailLine,
  loadExistingInsights,
  toInsights,
} from './collect-insights.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') })
})

afterEach(async () => {
  await client.close()
})

const existing = [
  { id: 'I1', source: 'https://github.com/timschoch/glue/pull/7' },
]

describe('toInsights', () => {
  it('turns a finding into a draft Insight with the next free id', () => {
    const findings = [
      {
        source: 'https://github.com/timschoch/glue/actions/runs/1/job/2',
        title: 'PR #13 verify check failed',
        date: '2026-09-29',
        body: 'verify failed on https://github.com/timschoch/glue/pull/13.',
      },
    ]
    const [insight] = toInsights(findings, existing)
    expect(insight.id).toBe('I2')
    expect(insight.frontmatter.status).toBe('draft')
    expect(insight.frontmatter.source).toBe(findings[0].source)
    expect(insight.frontmatter.date).toBe('2026-09-29')
  })

  it('skips a finding whose source already exists', () => {
    const findings = [
      {
        source: 'https://github.com/timschoch/glue/pull/7',
        title: 'Duplicate of an existing Insight',
        date: '2026-09-29',
        body: 'Already recorded.',
      },
    ]
    expect(toInsights(findings, existing)).toEqual([])
  })

  it('gives several new findings in one run the next id in order', () => {
    const findings = [
      {
        source: 'https://github.com/timschoch/glue/pull/13#issuecomment-1',
        title: 'PR #13 interface review blocked',
        date: '2026-09-29',
        body: 'Blocked.',
      },
      {
        source: 'https://github.com/timschoch/glue/pull/14#issuecomment-2',
        title: 'PR #14 interface review blocked',
        date: '2026-09-29',
        body: 'Blocked.',
      },
    ]
    const insights = toInsights(findings, existing)
    expect(insights.map((insight) => insight.id)).toEqual(['I2', 'I3'])
  })

  it('starts numbering at I1 when there are no existing Insights', () => {
    const findings = [
      {
        source: 'https://github.com/timschoch/glue/pull/1',
        title: 'First finding',
        date: '2026-09-29',
        body: 'Body.',
      },
    ]
    expect(toInsights(findings, [])[0].id).toBe('I1')
  })
})

describe('extractFailLine', () => {
  it('reads a FAILED ci: <step> line from a verify log', () => {
    const log = [
      'verify\t2026-09-29T00:00:00Z Running push stage',
      'verify\t2026-09-29T00:00:01Z FAILED ci: typecheck, after 1.2s',
    ].join('\n')
    expect(extractFailLine(log)).toBe('FAILED ci: typecheck, after 1.2s')
  })

  it('returns null when the log has no failure line', () => {
    const log = 'verify\t2026-09-29T00:00:00Z all steps passed'
    expect(extractFailLine(log)).toBeNull()
  })
})

describe('database Insight rows', () => {
  it('inserts new findings with the next ids', async () => {
    const drafts = toInsights(
      [
        {
          source: 'https://github.com/timschoch/glue/pull/1',
          title: 'First finding',
          date: '2026-09-29',
          body: 'Body.',
        },
      ],
      [],
    )

    await addInsights(db, 'glue', drafts)

    const rows = await loadExistingInsights(db, 'glue')
    expect(rows.map((row) => row.id)).toEqual(['I1'])
    expect(rows[0].source).toBe('https://github.com/timschoch/glue/pull/1')
  })

  it('inserts nothing for a finding whose source already exists', async () => {
    const first = toInsights(
      [
        {
          source: 'https://github.com/timschoch/glue/pull/1',
          title: 'First finding',
          date: '2026-09-29',
          body: 'Body.',
        },
      ],
      [],
    )
    await addInsights(db, 'glue', first)

    const existingRows = await loadExistingInsights(db, 'glue')
    const second = toInsights(
      [
        {
          source: 'https://github.com/timschoch/glue/pull/1',
          title: 'First finding',
          date: '2026-09-29',
          body: 'Body.',
        },
      ],
      existingRows,
    )

    expect(second).toEqual([])
  })

  it('inserts nothing on a second run', async () => {
    const finding = [
      {
        source: 'https://github.com/timschoch/glue/pull/1',
        title: 'First finding',
        date: '2026-09-29',
        body: 'Body.',
      },
    ]

    const firstRun = toInsights(finding, await loadExistingInsights(db, 'glue'))
    await addInsights(db, 'glue', firstRun)

    const secondRun = toInsights(
      finding,
      await loadExistingInsights(db, 'glue'),
    )
    await addInsights(db, 'glue', secondRun)

    const rows = await loadExistingInsights(db, 'glue')
    expect(rows).toHaveLength(1)
  })
})
