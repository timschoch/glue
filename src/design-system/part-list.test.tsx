// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { PartList } from './part-list.tsx'
import type { PartListPart } from './part-list.tsx'

const GOAL: PartListPart = {
  id: 'G2',
  type: 'goal',
  title: 'First bake feels easy',
  trust: 'flagged',
  workState: 'to-check',
  concept: 'First bake',
  href: '#G2',
}

const DECISION: PartListPart = {
  id: 'D12',
  type: 'decision',
  title: 'Show the video of the creator',
  trust: 'not-ready',
  workState: 'review',
  concept: 'Technique videos',
  href: '#D12',
}

afterEach(cleanup)

describe('PartList', () => {
  it('shows the title and one card per Part, with the Work state and the home Concept', () => {
    render(<PartList title="Mine" parts={[GOAL, DECISION]} />)

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
    render(<PartList title="Mine" parts={[GOAL, DECISION]} onOpen={onOpen} />)

    await userEvent.click(screen.getByRole('link', { name: / D12 / }))

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(DECISION, expect.anything())
  })

  it('shows the title alone without a Part', () => {
    render(<PartList title="Mine" parts={[]} />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Mine')
    expect(screen.queryByRole('list')).toBeNull()
  })
})
