// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { SectionView } from './section-view.tsx'
import type { SectionViewPart } from './section-view.tsx'

const GOAL: SectionViewPart = {
  id: 'G2',
  type: 'goal',
  title: 'First bake feels easy',
  trust: 'solid',
  workState: 'published',
  concept: 'First bake',
  home: 'first-bake',
  flightLevel: 'operational',
  href: '#G2',
}

function decision(
  id: string,
  trust: SectionViewPart['trust'],
  home: string,
  concept: string,
): SectionViewPart {
  return {
    id,
    type: 'decision',
    title: `Decision ${id}`,
    trust,
    workState: 'draft',
    concept,
    home,
    flightLevel: 'strategic',
    href: `#${id}`,
  }
}

const D12 = decision('D12', 'not-ready', 'technique-videos', 'Technique videos')
const D13 = decision('D13', 'solid', 'technique-videos', 'Technique videos')
const D14 = decision('D14', 'flagged', 'first-bake', 'First bake')
const PARTS = [GOAL, D12, D13, D14]

function renderView(props: Partial<Parameters<typeof SectionView>[0]> = {}) {
  render(
    <SectionView
      title="Decide"
      types={['goal', 'decision']}
      parts={PARTS}
      {...props}
    />,
  )
}

// The record ids of the cards, in the order of the document.
function cards(): Array<string | undefined> {
  return screen
    .queryAllByRole('link')
    .map((card) => /[A-Z]\d+/.exec(card.textContent)?.[0])
}

// The summary rows, in the order of the document.
function rows(): Array<string | null> {
  return screen
    .queryAllByRole('button', { expanded: false })
    .map((row) => row.textContent)
}

afterEach(cleanup)

describe('SectionView', () => {
  it('shows the Operational Parts as cards, and the Strategic ones as one row per Concept with the count and the weakest Trust', () => {
    renderView()

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Decide')
    expect(cards()).toEqual(['G2'])
    expect(rows()).toEqual([
      'Not ready Technique videos 2',
      'Flagged First bake 1',
    ])
  })

  it('opens the Parts of a row in detail with a click', async () => {
    renderView()

    await userEvent.click(
      screen.getByRole('button', { name: /Technique videos/ }),
    )

    expect(cards()).toEqual(['G2', 'D12', 'D13'])
    expect(rows()).toEqual(['Flagged First bake 1'])
  })

  it('shows each Part as a card in the detail of the whole section', () => {
    renderView({ detail: true })

    expect(cards()).toEqual(['G2', 'D12', 'D13', 'D14'])
    expect(rows()).toEqual([])
    expect(
      within(screen.getByRole('region', { name: 'Decisions' }))
        .getAllByRole('link')
        .map((card) => card.textContent),
    ).toEqual([
      'Not ready Decision D12 Decision D12 Draft Technique videos',
      'Solid Decision D13 Decision D13 Draft Technique videos',
      'Flagged Decision D14 Decision D14 Draft First bake',
    ])
  })

  it('switches the whole section to detail and back', async () => {
    const onDetailChange = vi.fn()
    renderView({ onDetailChange })

    expect(
      screen
        .getByRole('tab', { name: 'Summary' })
        .getAttribute('aria-selected'),
    ).toBe('true')

    await userEvent.click(screen.getByRole('tab', { name: 'Detail' }))

    expect(onDetailChange).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('names the switch', () => {
    renderView({ onDetailChange: vi.fn() })

    within(screen.getByRole('tablist', { name: 'Flight level' })).getByRole(
      'tab',
      { name: 'Detail' },
    )
  })

  it('has no switch without a Strategic Part', () => {
    renderView({ parts: [GOAL], onDetailChange: vi.fn() })

    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('keeps the switch in the detail, also without a Strategic Part', async () => {
    const onDetailChange = vi.fn()
    renderView({ parts: [GOAL], detail: true, onDetailChange })

    await userEvent.click(screen.getByRole('tab', { name: 'Summary' }))

    expect(onDetailChange).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('has one control per Part type that adds a Part, and none without the callback', async () => {
    const onAddPart = vi.fn()
    renderView({ onAddPart })

    await userEvent.click(screen.getByRole('button', { name: 'Add Decision' }))

    expect(onAddPart).toHaveBeenCalledExactlyOnceWith('decision')
    // The Decisions are in the rows: no group that reads as "none".
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Goals'])

    cleanup()
    renderView()

    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull()
  })

  it('opens the record of a card', async () => {
    const onOpen = vi.fn()
    renderView({ onOpen })

    await userEvent.click(screen.getByRole('link', { name: / G2 / }))

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(GOAL, expect.anything())
  })
})
