import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderInsight, toInsights } from './collect-insights.mjs'

const existing = [
  { id: 'I1', source: 'https://github.com/timschoch/glue/pull/7' },
]

test('a finding becomes a draft Insight with the next free id', () => {
  const findings = [
    {
      source: 'https://github.com/timschoch/glue/actions/runs/1/job/2',
      title: 'PR #13 verify check failed',
      date: '2026-09-29',
      body: 'verify failed on https://github.com/timschoch/glue/pull/13.',
    },
  ]
  const [insight] = toInsights(findings, existing)
  assert.equal(insight.id, 'I2')
  assert.equal(insight.file, 'I2-pr-13-verify-check-failed.md')
  assert.equal(insight.frontmatter.status, 'draft')
  assert.equal(insight.frontmatter.source, findings[0].source)
  assert.equal(insight.frontmatter.date, '2026-09-29')
})

test('a finding whose source already exists is skipped, idempotent', () => {
  const findings = [
    {
      source: 'https://github.com/timschoch/glue/pull/7',
      title: 'Duplicate of an existing Insight',
      date: '2026-09-29',
      body: 'Already recorded.',
    },
  ]
  assert.deepEqual(toInsights(findings, existing), [])
})

test('several new findings in one run each get the next id in order', () => {
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
  assert.deepEqual(
    insights.map((insight) => insight.id),
    ['I2', 'I3'],
  )
})

test('no existing Insights starts numbering at I1', () => {
  const findings = [
    {
      source: 'https://github.com/timschoch/glue/pull/1',
      title: 'First finding',
      date: '2026-09-29',
      body: 'Body.',
    },
  ]
  assert.equal(toInsights(findings, [])[0].id, 'I1')
})

test('renderInsight writes the frontmatter from concept/README.md plus status and the body', () => {
  const [insight] = toInsights(
    [
      {
        source: 'https://github.com/timschoch/glue/pull/13',
        title: 'PR #13 verify check failed',
        date: '2026-09-29',
        body: 'verify failed on https://github.com/timschoch/glue/pull/13.',
      },
    ],
    [],
  )
  assert.equal(
    renderInsight(insight),
    [
      '---',
      'id: I1',
      'title: PR #13 verify check failed',
      'date: 2026-09-29',
      'source: https://github.com/timschoch/glue/pull/13',
      'status: draft',
      '---',
      'verify failed on https://github.com/timschoch/glue/pull/13.',
      '',
    ].join('\n'),
  )
})
