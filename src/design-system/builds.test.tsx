// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { Builds } from './builds.tsx'
import type { BuildRow } from './builds.tsx'

const OPEN: BuildRow = {
  number: 12,
  url: 'https://github.com/timschoch/glue/pull/12',
  title: 'Show the builds',
  state: 'open',
  decisions: [
    {
      id: 'D28',
      type: 'decision',
      title: 'A build names its Contract Version',
      trust: 'solid',
      href: '#D28',
    },
  ],
  contract: null,
  stale: false,
}

const OLD: BuildRow = {
  number: 11,
  url: 'https://github.com/timschoch/glue/pull/11',
  title: 'Loop the video',
  state: 'merged',
  decisions: [],
  contract: { title: 'Technique videos', version: 1, href: '#videos-1' },
  stale: true,
}

afterEach(cleanup)

function row(title: string): HTMLElement {
  const item = screen
    .getAllByRole('listitem')
    .find((listed) => listed.textContent.includes(title))
  if (!item) throw new Error(`No build ${title}`)
  return item
}

describe('Builds', () => {
  it('shows each build with its title as the link out, and its state', () => {
    render(<Builds builds={[OPEN, OLD]} />)

    const open = within(row(OPEN.title))

    expect(screen.getByRole('heading', { name: 'Builds' })).toBeTruthy()
    expect(
      open.getByRole('link', { name: OPEN.title }).getAttribute('href'),
    ).toBe(OPEN.url)
    expect(open.getByText('Open')).toBeTruthy()
    expect(within(row(OLD.title)).getByText('Merged')).toBeTruthy()
  })

  it('shows the card of the Decision that a build names, and opens it', async () => {
    const onOpenPart = vi.fn(
      (_part: unknown, event: { preventDefault: () => void }) =>
        event.preventDefault(),
    )
    render(<Builds builds={[OPEN, OLD]} onOpenPart={onOpenPart} />)

    const card = within(row(OPEN.title)).getByRole('link', { name: /D28/ })
    await userEvent.click(card)

    expect(card.getAttribute('href')).toBe('#D28')
    expect(onOpenPart).toHaveBeenCalledWith(
      OPEN.decisions[0],
      expect.anything(),
    )
  })

  it('shows the Contract Version that a build names as a link to it', () => {
    render(<Builds builds={[OPEN, OLD]} />)

    const contract = within(row(OLD.title)).getByRole('link', {
      name: 'Technique videos Version 1',
    })

    expect(contract.getAttribute('href')).toBe('#videos-1')
  })

  it('marks only a stale build', () => {
    render(<Builds builds={[OPEN, OLD]} />)

    expect(within(row(OLD.title)).getByText('Stale')).toBeTruthy()
    expect(within(row(OPEN.title)).queryByText('Stale')).toBeNull()
  })

  it('says that there are no builds, or why', () => {
    const { rerender } = render(<Builds builds={[]} />)

    expect(screen.getByText('No builds')).toBeTruthy()

    rerender(<Builds builds={[]} reason="The Project has no repository" />)

    expect(screen.getByText('The Project has no repository')).toBeTruthy()
  })
})
