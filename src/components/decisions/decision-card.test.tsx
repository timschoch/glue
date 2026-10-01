// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { DecisionSummary } from '../../db/concept.ts'
import { renderInRouter, shownValue } from '../../test/render.tsx'
import { DecisionCard } from './decision-card'

const decision: DecisionSummary = {
  id: 'D42',
  title: 'Agents read the Concept through one export',
  date: '2026-01-15',
  owner: 'Owner',
  status: 'proposed',
  goal: { id: 'G7', title: 'Agents build from the Concept' },
  evidence: [
    { id: 'I3', title: 'Agents skip long documents' },
    { id: 'F9', title: 'An export is one request' },
  ],
}

function link(name: string) {
  return screen.getByRole('link', { name }).getAttribute('href')
}

describe('DecisionCard', () => {
  it('shows the id and the title as one link to the Decision, in a heading', async () => {
    await renderInRouter(<DecisionCard decision={decision} />)

    const heading = screen.getByRole('heading', { level: 3 })

    expect(heading.textContent).toBe(
      'D42 Agents read the Concept through one export',
    )
    expect(link('D42 Agents read the Concept through one export')).toBe(
      '/glue/concept/D42',
    )
  })

  it('shows the status, the date and the owner, each with a label', async () => {
    await renderInRouter(<DecisionCard decision={decision} />)

    expect(shownValue('Status')).toBe('Proposed')
    expect(shownValue('Date')).toBe('2026-01-15')
    expect(shownValue('Owner')).toBe('Owner')
    expect(
      screen
        .getByText('2026-01-15', { selector: 'time' })
        .getAttribute('datetime'),
    ).toBe('2026-01-15')
  })

  it.each([
    ['accepted', 'Accepted'],
    ['superseded', 'Superseded'],
  ] as const)('shows the status %s as %s', async (status, word) => {
    await renderInRouter(<DecisionCard decision={{ ...decision, status }} />)

    expect(shownValue('Status')).toBe(word)
  })

  it('links the Goal and each evidence record, with a label', async () => {
    await renderInRouter(<DecisionCard decision={decision} />)

    expect(shownValue('Goal')).toBe('G7 Agents build from the Concept')
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['I3 Agents skip long documents', 'F9 An export is one request'])
    expect(link('G7 Agents build from the Concept')).toBe('/glue/concept/G7')
    expect(link('I3 Agents skip long documents')).toBe('/glue/concept/I3')
    expect(link('F9 An export is one request')).toBe('/glue/concept/F9')
  })

  it('says that a Decision has no evidence', async () => {
    await renderInRouter(
      <DecisionCard decision={{ ...decision, evidence: [] }} />,
    )

    expect(shownValue('Evidence')).toBe('No evidence yet')
  })
})
