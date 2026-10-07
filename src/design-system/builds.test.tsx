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
  gate: 'holds',
  guardrails: [],
}

const OLD: BuildRow = {
  number: 11,
  url: 'https://github.com/timschoch/glue/pull/11',
  title: 'Loop the video',
  state: 'merged',
  decisions: [],
  contract: { title: 'Technique videos', version: 1, href: '#videos-1' },
  stale: true,
  gate: 'breaks',
  guardrails: [
    { id: 'R1', title: 'Tests come first', href: '#R1', state: 'passed' },
    { id: 'R2', title: 'No raw colour', href: '#R2', state: 'failed' },
    { id: 'R3', title: 'No query over 200ms', href: '#R3', state: 'waiting' },
    {
      id: 'R4',
      title: 'No text that describes the UI',
      href: '#R4',
      state: 'by-person',
    },
  ],
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

    screen.getByRole('heading', { name: 'Builds' })
    expect(
      open.getByRole('link', { name: OPEN.title }).getAttribute('href'),
    ).toBe(OPEN.url)
    open.getByText('Open')
    within(row(OLD.title)).getByText('Merged')
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

    within(row(OLD.title)).getByText('Stale')
    expect(within(row(OPEN.title)).queryByText('Stale')).toBeNull()
  })

  it('shows the newest gate result of a build as its sign', () => {
    const unchecked: BuildRow = {
      ...OPEN,
      number: 10,
      title: 'Write with Carbon',
      decisions: [],
      gate: null,
    }
    render(<Builds builds={[OPEN, OLD, unchecked]} />)

    within(row(OPEN.title)).getByRole('img', { name: 'Holds' })
    within(row(OLD.title)).getByRole('img', { name: 'Breaks' })
    expect(
      within(row(OPEN.title)).queryByRole('img', { name: 'Breaks' }),
    ).toBeNull()
    expect(within(row(unchecked.title)).queryByRole('img')).toBeNull()
  })

  it('shows each Guardrail of a build as a link to it, with its state', async () => {
    const onOpenGuardrail = vi.fn(
      (_guardrail: unknown, event: { preventDefault: () => void }) =>
        event.preventDefault(),
    )
    render(<Builds builds={[OPEN, OLD]} onOpenGuardrail={onOpenGuardrail} />)

    const guardrails = within(
      within(row(OLD.title)).getByRole('list', { name: 'Guardrails' }),
    ).getAllByRole('listitem')
    const first = within(guardrails[0]).getByRole('link')
    await userEvent.click(first)

    expect(
      guardrails.map(
        (guardrail) => within(guardrail).getByRole('link').textContent,
      ),
    ).toEqual([
      'R1 Tests come first',
      'R2 No raw colour',
      'R3 No query over 200ms',
      'R4 No text that describes the UI',
    ])
    expect(first.getAttribute('href')).toBe('#R1')
    expect(onOpenGuardrail).toHaveBeenCalledWith(
      OLD.guardrails[0],
      expect.anything(),
    )
    expect(
      within(row(OPEN.title)).queryByRole('list', { name: 'Guardrails' }),
    ).toBeNull()
  })

  it('shows a passed and a failed Guardrail with the signs of the gate, and the other states as a word', () => {
    render(<Builds builds={[OLD]} />)

    const [passed, failed, waiting, byPerson] = within(
      screen.getByRole('list', { name: 'Guardrails' }),
    ).getAllByRole('listitem')
    const holds = within(row(OLD.title)).getByRole('img', { name: 'Breaks' })

    within(passed).getByRole('img', { name: 'Passed' })
    expect(
      within(failed).getByRole('img', { name: 'Failed' }).getAttribute('class'),
    ).toBe(holds.getAttribute('class'))
    expect(within(waiting).queryByRole('img')).toBeNull()
    within(waiting).getByText('Waiting')
    expect(within(byPerson).queryByRole('img')).toBeNull()
    within(byPerson).getByText('By a person')
  })

  it('says that there are no builds, or why', () => {
    const { rerender } = render(<Builds builds={[]} />)

    screen.getByText('No builds')

    rerender(<Builds builds={[]} reason="The Project has no repository" />)

    screen.getByText('The Project has no repository')
  })
})
