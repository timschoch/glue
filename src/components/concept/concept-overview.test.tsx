// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { Concept } from '../../db/concept.ts'
import { renderInRouter } from '../../test/render.tsx'
import { Announcer } from '../page/announcer.tsx'
import { ConceptOverview } from './concept-overview.tsx'

const goal = { id: 'G1', title: 'Agents build from the Concept' }

const concept: Concept = {
  product: { slug: 'glue', name: 'Glue' },
  goals: [
    {
      ...goal,
      metric: 'Share of tickets with a Decision',
      status: 'open',
      latestValue: null,
    },
  ],
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

const handlers = {
  onKeep: () => Promise.resolve(undefined),
  onDiscard: () => Promise.resolve(undefined),
}

function section(name: string) {
  return within(screen.getByRole('region', { name }))
}

describe('ConceptOverview', () => {
  // The breadcrumb of a record and the link of a missing page say Concept too.
  it('has the name Concept, the one name of the overview', async () => {
    await renderInRouter(<ConceptOverview {...handlers} concept={concept} />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Concept',
    )
  })

  it('shows the title of a Decision in the size of the other record titles', async () => {
    await renderInRouter(<ConceptOverview {...handlers} concept={concept} />)

    const sizes = screen
      .getAllByRole('heading', { level: 3 })
      .map((title) => title.style.getPropertyValue('--title-fz'))

    expect(sizes).toHaveLength(7)
    expect(new Set(sizes)).toEqual(new Set(['var(--mantine-h3-font-size)']))
  })

  it('shows Goals, then Decisions, then Guardrails, then Insights and Facts', async () => {
    await renderInRouter(<ConceptOverview {...handlers} concept={concept} />)

    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Goals', 'Decisions', 'Guardrails', 'Insights', 'Facts'])
  })

  it('links each section with the number of its records', async () => {
    await renderInRouter(<ConceptOverview {...handlers} concept={concept} />)

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
    ['Goals', 'G1 Agents build from the Concept', '/glue/concept/G1'],
    [
      'Decisions',
      'D2 Agents read the Concept through one export',
      '/glue/concept/D2',
    ],
    ['Guardrails', 'R1 No query over 200 ms', '/glue/concept/R1'],
    ['Insights', 'I2 The build failed on a type error', '/glue/concept/I2'],
    ['Facts', 'F1 An export is one request', '/glue/concept/F1'],
  ])('links each record in %s to its page', async (name, record, path) => {
    await renderInRouter(<ConceptOverview {...handlers} concept={concept} />)

    expect(
      section(name).getByRole('link', { name: record }).getAttribute('href'),
    ).toBe(path)
  })

  it('shows what measures a Goal and what enforces a Guardrail', async () => {
    await renderInRouter(<ConceptOverview {...handlers} concept={concept} />)

    expect(
      section('Goals').getByText('Metric').nextElementSibling?.textContent,
    ).toBe('Share of tickets with a Decision')
    expect(
      section('Guardrails').getByText('Enforced by').nextElementSibling
        ?.textContent,
    ).toBe('verify ci')
  })

  it('shows the status of each Goal, and its latest value when it has one', async () => {
    await renderInRouter(
      <ConceptOverview
        {...handlers}
        concept={{
          ...concept,
          goals: [
            ...concept.goals,
            {
              id: 'G2',
              title: 'The task is easy',
              metric: 'SEQ mean',
              status: 'achieved',
              latestValue: 5.256,
            },
          ],
        }}
      />,
    )

    const [open, achieved] = section('Goals').getAllByRole('listitem')

    expect(
      within(open).getByText('Status').nextElementSibling?.textContent,
    ).toBe('Open')
    expect(within(open).queryByText('Latest value')).toBeNull()
    expect(
      within(achieved).getByText('Status').nextElementSibling?.textContent,
    ).toBe('Achieved')
    expect(
      within(achieved).getByText('Latest value').nextElementSibling
        ?.textContent,
    ).toBe('5.26')
  })

  it('shows the date of each Insight, and the status of a draft', async () => {
    await renderInRouter(<ConceptOverview {...handlers} concept={concept} />)

    const [draft, first] = section('Insights').getAllByRole('listitem')

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
      await renderInRouter(<ConceptOverview {...handlers} concept={empty} />)

      expect(section(name).getByText(text)).toBeDefined()
      expect(section(name).queryAllByRole('listitem')).toEqual([])
    },
  )

  describe('the draft Insights', () => {
    const drafts: Concept = {
      ...concept,
      insights: [
        ...concept.insights,
        {
          id: 'I3',
          title: 'A review found a missing test',
          date: '2026-03-04',
          status: 'draft',
        },
      ],
    }

    const draft = () => within(section('Insights').getAllByRole('listitem')[0])

    it('come first in the Insights', async () => {
      await renderInRouter(<ConceptOverview {...handlers} concept={drafts} />)

      expect(
        section('Insights')
          .getAllByRole('heading', { level: 3 })
          .map((title) => title.textContent.slice(0, 2)),
      ).toEqual(['I2', 'I3', 'I1'])
    })

    it.each([
      [concept, '1 draft Insight to triage'],
      [drafts, '2 draft Insights to triage'],
    ])(
      'have their number at the top, with a link to them',
      async (shown, name) => {
        await renderInRouter(<ConceptOverview {...handlers} concept={shown} />)

        expect(screen.getByRole('link', { name }).getAttribute('href')).toBe(
          '#insights',
        )
      },
    )

    it('have no number at the top when there are none', async () => {
      await renderInRouter(<ConceptOverview {...handlers} concept={empty} />)

      expect(screen.queryByRole('link', { name: /to triage/ })).toBeNull()
    })

    it('keeps the draft of the row on request', async () => {
      const onKeep = vi.fn(() => Promise.resolve(undefined))
      await renderInRouter(
        <ConceptOverview {...handlers} onKeep={onKeep} concept={drafts} />,
      )

      await userEvent.click(draft().getByRole('button', { name: 'Keep I2' }))

      expect(onKeep).toHaveBeenCalledExactlyOnceWith('I2')
    })

    it('discards the draft of the row after a second request', async () => {
      const onDiscard = vi.fn(() => Promise.resolve(undefined))
      await renderInRouter(
        <ConceptOverview
          {...handlers}
          onDiscard={onDiscard}
          concept={drafts}
        />,
      )

      await userEvent.click(draft().getByRole('button', { name: 'Discard I2' }))
      await userEvent.click(
        draft().getByRole('button', { name: 'Discard I2 for good' }),
      )

      expect(onDiscard).toHaveBeenCalledExactlyOnceWith('I2')
    })

    function renderAnnounced(
      shown: Concept,
      actions: Partial<ComponentProps<typeof ConceptOverview>> = {},
    ) {
      return renderInRouter(
        <Announcer>
          <ConceptOverview {...handlers} {...actions} concept={shown} />
        </Announcer>,
      )
    }

    it('says that the draft was kept, and moves the focus to the next draft', async () => {
      await renderAnnounced(drafts)

      await userEvent.click(screen.getByRole('button', { name: 'Keep I2' }))

      expect(screen.getByRole('status').textContent).toBe('Kept I2.')
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Keep I3' }),
      )
    })

    it('says that the last draft was discarded, and moves the focus to the heading', async () => {
      await renderAnnounced(drafts)

      await userEvent.click(screen.getByRole('button', { name: 'Discard I3' }))
      await userEvent.click(
        screen.getByRole('button', { name: 'Discard I3 for good' }),
      )

      expect(screen.getByRole('status').textContent).toBe('Discarded I3.')
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'Insights' }),
      )
    })

    it('says nothing, and keeps the focus, when the draft was not kept', async () => {
      await renderAnnounced(drafts, {
        onKeep: () => Promise.resolve({ message: 'Sign in again' }),
      })

      await userEvent.click(screen.getByRole('button', { name: 'Keep I2' }))

      expect(screen.getByRole('status').textContent).toBe('')
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Keep I2' }),
      )
    })

    it('has no Discard for a draft that is the evidence of a Decision', async () => {
      const [accepted, proposed] = concept.decisions
      await renderAnnounced({
        ...drafts,
        decisions: [
          accepted,
          { ...proposed, evidence: [{ id: 'I2', title: 'The build failed' }] },
        ],
      })

      expect(screen.queryByRole('button', { name: 'Discard I2' })).toBeNull()
      expect(
        screen.getByText('I2 is evidence of D2, so you cannot discard it.'),
      ).toBeDefined()
      expect(screen.getByRole('button', { name: 'Discard I3' })).toBeDefined()
    })

    it('links the draft of the row to the Decision form', async () => {
      await renderInRouter(<ConceptOverview {...handlers} concept={drafts} />)

      expect(
        draft()
          .getByRole('link', { name: 'Propose a Decision from I2' })
          .getAttribute('href'),
      ).toBe('/glue/decisions/new?evidence=I2')
    })

    it('has no triage for an Insight that is not a draft', async () => {
      await renderInRouter(<ConceptOverview {...handlers} concept={drafts} />)

      expect(screen.queryByRole('button', { name: 'Keep I1' })).toBeNull()
    })
  })

  it('links to the form for a new Decision', async () => {
    await renderInRouter(<ConceptOverview {...handlers} concept={concept} />)

    expect(
      section('Decisions')
        .getByRole('link', { name: 'Propose a Decision' })
        .getAttribute('href'),
    ).toBe('/glue/decisions/new')
  })
})
