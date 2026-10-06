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

// A Hunch of the Project Bakeday, as the Project that is asked sees it.
const HUNCH = {
  id: 'I7',
  type: 'insight',
  title: 'Novices skip the fold',
  trust: 'solid',
  concept: 'Bakeday',
  href: '/bakeday/bakeday/I7',
} as const

// jsdom has no layout, Carbon's dropdown scrolls to the highlighted item.
Element.prototype.scrollIntoView = () => {}

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
        watched={[{ ...DECISION, note: 'Changed: I7 Bakers want step videos' }]}
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
      'Not ready Decision D12 Show the video of the creator Changed: I7 Bakers want step videos Review Technique videos',
    ])
  })

  it('shows the Asks in a group of their own, each with its one step', async () => {
    const onClick = vi.fn()
    render(
      <PartCards
        title="Mine"
        parts={[GOAL]}
        asks={[{ id: 1, part: HUNCH, action: { label: 'Pick', onClick } }]}
      />,
    )

    const [asks, mine] = screen.getAllByRole('list')

    expect(screen.getByRole('list', { name: 'Asks' })).toBe(asks)
    expect(
      within(asks)
        .getAllByRole('link')
        .map((card) => [card.textContent, card.getAttribute('href')]),
    ).toEqual([
      ['Solid Insight I7 Novices skip the fold Bakeday', '/bakeday/bakeday/I7'],
    ])
    expect(within(mine).getAllByRole('link')).toHaveLength(1)

    await userEvent.click(within(asks).getByRole('button', { name: 'Pick' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('asks for the Part of a step that needs one, and gives its record id', async () => {
    const onPick = vi.fn()
    render(
      <PartCards
        title="Mine"
        parts={[]}
        asks={[
          {
            id: 1,
            part: HUNCH,
            action: {
              label: 'Hand back',
              pick: {
                label: 'Insight',
                parts: [{ ...HUNCH, id: 'I2', title: 'Novices read step one' }],
                onPick,
              },
            },
          },
        ]}
      />,
    )

    expect(screen.queryByRole('combobox')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Hand back' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Insight' }))
    await userEvent.click(
      screen.getByRole('option', { name: 'I2 Novices read step one' }),
    )

    expect(onPick).toHaveBeenCalledExactlyOnceWith('I2')
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('shows the step that runs, and why the last one failed', () => {
    const ask = {
      id: 1,
      part: HUNCH,
      action: { label: 'Pick', onClick: () => {} },
    }
    const { rerender } = render(
      <PartCards title="Mine" parts={[]} asks={[ask]} pending="Saving" />,
    )

    screen.getByText('Saving')

    rerender(
      <PartCards
        title="Mine"
        parts={[]}
        asks={[ask]}
        error="Fred picked Ask 1 already"
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain(
      'Fred picked Ask 1 already',
    )
  })

  it('shows no watched group without a watched Part', () => {
    render(<PartCards title="Mine" parts={[GOAL]} watched={[]} />)

    expect(screen.queryByRole('list', { name: 'Watched' })).toBeNull()
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })
})
