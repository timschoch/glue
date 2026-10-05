// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { PartCards } from './part-cards.tsx'
import type { PartCardsPart } from './part-cards.tsx'

const GOAL: PartCardsPart = {
  id: 'G2',
  type: 'goal',
  title: 'First bake feels easy',
  trust: 'flagged',
  workState: 'to-check',
  concept: 'First bake',
  href: '#G2',
}

const DECISION: PartCardsPart = {
  id: 'D12',
  type: 'decision',
  title: 'Show the video of the creator',
  trust: 'not-ready',
  workState: 'review',
  concept: 'Technique videos',
  href: '#D12',
}

afterEach(cleanup)

describe('PartCards', () => {
  it('shows the title and one card per Part, with the Work state and the home Concept', () => {
    render(<PartCards title="Mine" parts={[GOAL, DECISION]} />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Mine')
    expect(screen.getAllByRole('link').map((card) => card.textContent)).toEqual(
      [
        'Flagged Goal G2 First bake feels easy To check First bake',
        'Not ready Decision D12 Show the video of the creator Review Technique videos',
      ],
    )
    expect(
      screen.getAllByRole('link').map((card) => card.getAttribute('href')),
    ).toEqual(['#G2', '#D12'])
  })

  it('opens the record of a card', async () => {
    const onOpen = vi.fn()
    render(<PartCards title="Mine" parts={[GOAL, DECISION]} onOpen={onOpen} />)

    await userEvent.click(screen.getByRole('link', { name: / D12 / }))

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(DECISION, expect.anything())
  })

  it('shows the title alone without a Part', () => {
    render(<PartCards title="Mine" parts={[]} />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Mine')
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('shows the watched Parts in a group of their own, each with its note', () => {
    render(
      <PartCards
        title="Mine"
        parts={[GOAL]}
        watched={[{ ...DECISION, note: 'Changed I7 Bakers want step videos' }]}
      />,
    )

    const cards = (list: HTMLElement) =>
      within(list)
        .getAllByRole('link')
        .map((card) => card.textContent)
    const [mine, watched] = screen.getAllByRole('list')

    expect(cards(mine)).toEqual([
      'Flagged Goal G2 First bake feels easy To check First bake',
    ])
    expect(screen.getByRole('list', { name: 'Watched' })).toBe(watched)
    expect(cards(watched)).toEqual([
      'Not ready Decision D12 Show the video of the creator Changed I7 Bakers want step videos Review Technique videos',
    ])
  })

  it('shows no watched group without a watched Part', () => {
    render(<PartCards title="Mine" parts={[GOAL]} watched={[]} />)

    expect(screen.queryByRole('list', { name: 'Watched' })).toBeNull()
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })
})
