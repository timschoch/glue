// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Concept } from '../../db/concept.ts'
import { renderInRouter } from '../../test/render.tsx'
import { ConceptOverview } from './concept-overview.tsx'

const goal = { id: 'G1', title: 'Agents build from the Concept' }

const concept: Concept = {
  product: { slug: 'glue', name: 'Glue' },
  goals: [{ ...goal, metric: 'Share of tickets with a Decision' }],
  decisions: [
    {
      id: 'D1',
      title: 'The Concept lives in the database',
      date: '2026-01-15',
      owner: 'Owner',
      status: 'accepted',
      goal,
      evidence: [{ id: 'I1', title: 'Agents skip long documents' }],
    },
    {
      id: 'D2',
      title: 'Agents read the Concept through one export',
      date: '2026-02-01',
      owner: 'Owner',
      status: 'proposed',
      goal,
      evidence: [],
    },
  ],
  guardrails: [
    { id: 'R1', title: 'No query over 200 ms', enforcedBy: 'verify ci' },
  ],
  insights: [
    {
      id: 'I1',
      title: 'Agents skip long documents',
      date: '2026-01-10',
      status: null,
    },
    {
      id: 'I2',
      title: 'The build failed on a type error',
      date: '2026-03-02',
      status: 'draft',
    },
  ],
  facts: [{ id: 'F1', title: 'An export is one request' }],
}

const empty: Concept = {
  product: concept.product,
  goals: [],
  decisions: [],
  guardrails: [],
  insights: [],
  facts: [],
}

function section(name: string) {
  return within(screen.getByRole('region', { name }))
}

describe('ConceptOverview', () => {
  // The breadcrumb of a record and the link of a missing page say Concept too.
  it('has the name Concept, the one name of the overview', async () => {
    await renderInRouter(<ConceptOverview concept={concept} />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Concept',
    )
  })

  it('shows the title of a Decision in the size of the other record titles', async () => {
    await renderInRouter(<ConceptOverview concept={concept} />)

    const sizes = screen
      .getAllByRole('heading', { level: 3 })
      .map((title) => title.style.getPropertyValue('--title-fz'))

    expect(sizes).toHaveLength(7)
    expect(new Set(sizes)).toEqual(new Set(['var(--mantine-h3-font-size)']))
  })

  it('shows Goals, then Decisions, then Guardrails, then Insights and Facts', async () => {
    await renderInRouter(<ConceptOverview concept={concept} />)

    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Goals', 'Decisions', 'Guardrails', 'Insights', 'Facts'])
  })

  it('links each section with the number of its records', async () => {
    await renderInRouter(<ConceptOverview concept={concept} />)

    const sections = within(
      screen.getByRole('navigation', { name: 'Sections' }),
    )

    expect(
      sections
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Goals 1', '#goals'],
      ['Decisions 2', '#decisions'],
      ['Guardrails 1', '#guardrails'],
      ['Insights 2', '#insights'],
      ['Facts 1', '#facts'],
    ])
    expect(document.getElementById('insights')).not.toBeNull()
  })

  it.each([
    ['Goals', 'G1 Agents build from the Concept', '/concept/G1'],
    [
      'Decisions',
      'D2 Agents read the Concept through one export',
      '/concept/D2',
    ],
    ['Guardrails', 'R1 No query over 200 ms', '/concept/R1'],
    ['Insights', 'I2 The build failed on a type error', '/concept/I2'],
    ['Facts', 'F1 An export is one request', '/concept/F1'],
  ])('links each record in %s to its page', async (name, record, path) => {
    await renderInRouter(<ConceptOverview concept={concept} />)

    expect(
      section(name).getByRole('link', { name: record }).getAttribute('href'),
    ).toBe(path)
  })

  it('shows what measures a Goal and what enforces a Guardrail', async () => {
    await renderInRouter(<ConceptOverview concept={concept} />)

    expect(
      section('Goals').getByText('Metric').nextElementSibling?.textContent,
    ).toBe('Share of tickets with a Decision')
    expect(
      section('Guardrails').getByText('Enforced by').nextElementSibling
        ?.textContent,
    ).toBe('verify ci')
  })

  it('shows the date of each Insight, and the status of a draft', async () => {
    await renderInRouter(<ConceptOverview concept={concept} />)

    const [first, draft] = section('Insights').getAllByRole('listitem')

    expect(within(first).getByText('2026-01-10')).toBeDefined()
    expect(within(first).queryByText('Status')).toBeNull()
    expect(
      within(draft).getByText('Status').nextElementSibling?.textContent,
    ).toBe('Draft')
  })

  it.each([
    ['Goals', 'No Goals yet. A Goal is a target that the Product must reach.'],
    [
      'Decisions',
      'No Decisions yet. A Decision serves a Goal and links to its evidence.',
    ],
    [
      'Guardrails',
      'No Guardrails yet. A Guardrail is a rule that every change to the Product must respect.',
    ],
    [
      'Insights',
      'No Insights yet. An Insight is a finding from research, usage data or feedback.',
    ],
    [
      'Facts',
      'No Facts yet. A Fact is a verified statement: a constraint, a number, a contract.',
    ],
  ])(
    'says that %s has no records, and what belongs there',
    async (name, text) => {
      await renderInRouter(<ConceptOverview concept={empty} />)

      expect(section(name).getByText(text)).toBeDefined()
      expect(section(name).queryAllByRole('listitem')).toEqual([])
    },
  )

  it('says how to get a Concept when the Product has none', async () => {
    await renderInRouter(<ConceptOverview concept={undefined} />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'No Concept yet',
    )
    expect(screen.getByText('pnpm concept add')).toBeDefined()
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull()
  })
})
