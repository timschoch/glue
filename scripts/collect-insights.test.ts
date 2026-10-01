import { join } from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { discardInsight } from '../src/db/concept-records.ts'
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
  it('turns a finding into a draft Insight', () => {
    const findings = [
      {
        source: 'https://github.com/timschoch/glue/actions/runs/1/job/2',
        title: 'PR #13 verify check failed',
        date: '2026-09-29',
        body: 'verify failed on https://github.com/timschoch/glue/pull/13.',
      },
    ]
    const [insight] = toInsights(findings, existing)
    expect(insight.status).toBe('draft')
    expect(insight.source).toBe(findings[0].source)
    expect(insight.date).toBe('2026-09-29')
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

  it('keeps one draft for two findings with the same source', () => {
    const finding = {
      source: 'https://github.com/timschoch/glue/pull/13#issuecomment-1',
      title: 'PR #13 interface review blocked',
      date: '2026-09-29',
      body: 'Blocked.',
    }

    expect(toInsights([finding, finding], existing)).toHaveLength(1)
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

  it('reads a FAIL <rule> line from the skilly gate', () => {
    const log =
      'skilly\t2026-09-29T00:00:00Z FAIL scripts/check-concept.mjs:45 verb-synonym: "needsQuoting" says needs, the repo says should'
    expect(extractFailLine(log)).toBe(
      'FAIL scripts/check-concept.mjs:45 verb-synonym: "needsQuoting" says needs, the repo says should',
    )
  })

  it('prefers the FAIL <rule> line over the FAILED <step> line, since it names the rule', () => {
    const log = [
      'verify\t2026-09-29T00:00:01Z FAILED ci: skilly / gate, after 0.8s',
      'skilly\t2026-09-29T00:00:00Z FAIL scripts/check-concept.mjs:45 verb-synonym: "needsQuoting" says needs, the repo says should',
    ].join('\n')
    expect(extractFailLine(log)).toBe(
      'FAIL scripts/check-concept.mjs:45 verb-synonym: "needsQuoting" says needs, the repo says should',
    )
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

    const ids = await addInsights(db, 'glue', drafts)

    const rows = await loadExistingInsights(db, 'glue')
    expect(ids).toEqual(['I1'])
    expect(rows.map((row) => row.id)).toEqual(['I1'])
    expect(rows[0].source).toBe('https://github.com/timschoch/glue/pull/1')
  })

  it('does not give the id of a discarded draft to the next finding', async () => {
    const [first, second] = ['pull/1', 'pull/2'].map((path) => ({
      source: `https://github.com/timschoch/glue/${path}`,
      title: 'A finding',
      date: '2026-09-29',
      body: 'Body.',
    }))
    const [discarded] = await addInsights(db, 'glue', toInsights([first], []))
    await discardInsight(db, 'glue', discarded)

    const ids = await addInsights(db, 'glue', toInsights([second], []))

    expect([discarded, ...ids]).toEqual(['I1', 'I2'])
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
