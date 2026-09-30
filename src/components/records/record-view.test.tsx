// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type {
  Decision,
  Fact,
  Goal,
  Guardrail,
  Insight,
} from '../../db/concept.ts'
import { renderInRouter, shownValue } from '../../test/render.tsx'
import { RecordView } from './record-view.tsx'

const decision: Decision = {
  kind: 'decision',
  id: 'D5',
  title: 'The Concept lives in the database',
  date: '2026-01-15',
  owner: 'Owner',
  status: 'accepted',
  body: 'Files do not scale to many Products.',
  goal: { id: 'G1', title: 'Agents build from the Concept' },
  evidence: [
    { id: 'I1', title: 'Agents skip long documents' },
    { id: 'F2', title: 'An export is one request' },
  ],
  supersededBy: null,
  supersedes: [],
}

const goal: Goal = {
  kind: 'goal',
  id: 'G1',
  title: 'Agents build from the Concept',
  metric: 'Share of tickets with a Decision',
  source: 'GitHub issues',
  measure: null,
  body: 'Each ticket names its Decision.',
  decisions: [{ id: 'D5', title: 'The Concept lives in the database' }],
}

const insight: Insight = {
  kind: 'insight',
  id: 'I1',
  title: 'Agents skip long documents',
  date: '2026-01-10',
  source: 'https://example.com/research?round=2',
  status: 'draft',
  body: 'Three of four agents read only the first screen.',
  decisions: [{ id: 'D5', title: 'The Concept lives in the database' }],
}

const fact: Fact = {
  kind: 'fact',
  id: 'F2',
  title: 'An export is one request',
  source: 'API contract',
  body: 'The export has one endpoint.',
  decisions: [],
}

const guardrail: Guardrail = {
  kind: 'guardrail',
  id: 'R1',
  title: 'No query over 200 ms',
  enforcedBy: 'verify ci',
  body: 'A slow query stops the build.',
}

function path(name: string) {
  return screen.getByRole('link', { name }).getAttribute('href')
}

function shownLinks(label: string) {
  const value = screen.getByText(label, { selector: 'dt' }).nextElementSibling
  if (!(value instanceof HTMLElement)) throw new Error(`${label} has no value`)
  return within(value)
    .queryAllByRole('link')
    .map((link) => [link.textContent, link.getAttribute('href')])
}

describe('RecordView', () => {
  it('shows the id and the title as the heading of the page', async () => {
    await renderInRouter(<RecordView record={decision} />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'D5 The Concept lives in the database',
    )
  })

  it.each([
    [decision, 'Decisions', '/#decisions'],
    [goal, 'Goals', '/#goals'],
    [insight, 'Insights', '/#insights'],
    [fact, 'Facts', '/#facts'],
    [guardrail, 'Guardrails', '/#guardrails'],
  ])(
    'shows the way back to the overview and to its section',
    async (record, section, target) => {
      await renderInRouter(<RecordView record={record} />)

      const breadcrumb = within(
        screen.getByRole('navigation', { name: 'Breadcrumb' }),
      )

      expect(
        breadcrumb
          .getAllByRole('link')
          .map((link) => [link.textContent, link.getAttribute('href')]),
      ).toEqual([
        ['Concept', '/'],
        [section, target],
      ])
    },
  )

  it('shows all fields of a Decision, with its Goal and its evidence', async () => {
    await renderInRouter(<RecordView record={decision} />)

    expect(shownValue('Status')).toBe('Accepted')
    expect(shownValue('Date')).toBe('2026-01-15')
    expect(shownValue('Owner')).toBe('Owner')
    expect(shownLinks('Goal')).toEqual([
      ['G1 Agents build from the Concept', '/concept/G1'],
    ])
    expect(shownLinks('Evidence')).toEqual([
      ['I1 Agents skip long documents', '/concept/I1'],
      ['F2 An export is one request', '/concept/F2'],
    ])
    expect(screen.queryByText('Superseded by')).toBeNull()
    expect(screen.queryByText('Supersedes')).toBeNull()
  })

  it('says that a Decision has no evidence', async () => {
    await renderInRouter(<RecordView record={{ ...decision, evidence: [] }} />)

    expect(shownValue('Evidence')).toBe('No evidence yet')
  })

  it('links a Decision to the Decisions before and after it', async () => {
    await renderInRouter(
      <RecordView
        record={{
          ...decision,
          status: 'superseded',
          supersededBy: { id: 'D9', title: 'The Concept has versions' },
          supersedes: [{ id: 'D2', title: 'The Concept lives in files' }],
        }}
      />,
    )

    expect(shownLinks('Superseded by')).toEqual([
      ['D9 The Concept has versions', '/concept/D9'],
    ])
    expect(shownLinks('Supersedes')).toEqual([
      ['D2 The Concept lives in files', '/concept/D2'],
    ])
  })

  it('shows all fields of a Goal, with the Decisions that serve it', async () => {
    await renderInRouter(<RecordView record={goal} />)

    expect(shownValue('Metric')).toBe('Share of tickets with a Decision')
    expect(shownValue('Source')).toBe('GitHub issues')
    expect(shownLinks('Decisions')).toEqual([
      ['D5 The Concept lives in the database', '/concept/D5'],
    ])
  })

  it('shows all fields of an Insight, with the Decisions that cite it', async () => {
    await renderInRouter(<RecordView record={insight} />)

    expect(shownValue('Status')).toBe('Draft')
    expect(shownValue('Date')).toBe('2026-01-10')
    expect(shownLinks('Cited by')).toEqual([
      ['D5 The Concept lives in the database', '/concept/D5'],
    ])
  })

  it('shows no status for an Insight without one', async () => {
    await renderInRouter(<RecordView record={{ ...insight, status: null }} />)

    expect(screen.queryByText('Status')).toBeNull()
  })

  it('shows a source that is a web address as a link', async () => {
    await renderInRouter(<RecordView record={insight} />)

    expect(path('https://example.com/research?round=2')).toBe(
      'https://example.com/research?round=2',
    )
  })

  it.each(['javascript:alert(1)', 'API contract', 'ftp://example.com/file'])(
    'shows the source %s as text',
    async (source) => {
      await renderInRouter(<RecordView record={{ ...fact, source }} />)

      expect(shownValue('Source')).toBe(source)
      expect(shownLinks('Source')).toEqual([])
    },
  )

  it('shows all fields of a Fact, and says that no Decision cites it', async () => {
    await renderInRouter(<RecordView record={fact} />)

    expect(shownValue('Source')).toBe('API contract')
    expect(shownValue('Cited by')).toBe('No Decision cites this Fact yet')
  })

  it('says that no Decision serves a Goal', async () => {
    await renderInRouter(<RecordView record={{ ...goal, decisions: [] }} />)

    expect(shownValue('Decisions')).toBe('No Decision serves this Goal yet')
  })

  it('shows what enforces a Guardrail', async () => {
    await renderInRouter(<RecordView record={guardrail} />)

    expect(shownValue('Enforced by')).toBe('verify ci')
  })

  describe('the body', () => {
    const body = [
      'The **first** paragraph.',
      'See https://example.com/page for the source.',
      '# A heading in the text',
      '- one\n- two',
      '<script>alert(1)</script>',
      '[a bad link](javascript:alert(1))',
    ].join('\n\n')

    it('shows Markdown as text with structure', async () => {
      await renderInRouter(<RecordView record={{ ...decision, body }} />)

      expect(screen.getByText('first').tagName).toBe('STRONG')
      expect(path('https://example.com/page')).toBe('https://example.com/page')
      expect(
        screen.getAllByRole('listitem').map((item) => item.textContent),
      ).toEqual(expect.arrayContaining(['one', 'two']))
    })

    it('keeps the record title the only heading of level 1', async () => {
      await renderInRouter(<RecordView record={{ ...decision, body }} />)

      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
      expect(
        screen.getByRole('heading', { name: 'A heading in the text' }).tagName,
      ).toBe('H2')
    })

    it('does not run code from the text', async () => {
      const { container } = await renderInRouter(
        <RecordView record={{ ...decision, body }} />,
      )

      expect(container.querySelector('script')).toBeNull()
      expect(container.innerHTML).not.toContain('javascript:')
    })

    it('does not load an image from another site', async () => {
      const { container } = await renderInRouter(
        <RecordView
          record={{
            ...insight,
            body: 'Before ![a pixel](https://evil.example/pixel.png) after.',
          }}
        />,
      )

      expect(container.querySelector('img')).toBeNull()
      expect(screen.getByText(/Before/).textContent).toBe('Before  after.')
    })

    it('says that a record has no text', async () => {
      await renderInRouter(<RecordView record={{ ...decision, body: '  ' }} />)

      expect(screen.getByText('This record has no text yet.')).toBeDefined()
    })
  })
})
