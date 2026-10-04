// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { Signals } from './signals.tsx'
import type { SignalRow } from './signals.tsx'

const SLOW: SignalRow = {
  url: 'https://github.com/timschoch/glue/issues/7',
  title: 'The list is slow',
  date: '2026-10-02',
  insight: null,
}

const LOST: SignalRow = {
  url: 'https://github.com/timschoch/glue/issues/5',
  title: 'I lose my place in the list',
  date: '2026-10-01',
  insight: null,
}

const GROWN: SignalRow = {
  url: 'https://github.com/timschoch/glue/issues/3',
  title: 'The search finds nothing',
  date: '2026-09-30',
  insight: { id: 'I4', title: 'Search needs synonyms', href: '#I4' },
}

afterEach(cleanup)

function renderSignals(props: Partial<Parameters<typeof Signals>[0]> = {}) {
  const onMakeInsight = vi.fn()
  render(
    <Signals
      signals={[SLOW, LOST, GROWN]}
      onMakeInsight={onMakeInsight}
      {...props}
    />,
  )
  return { onMakeInsight }
}

function row(title: string): HTMLElement {
  const item = screen
    .getAllByRole('listitem')
    .find((listed) => listed.textContent.includes(title))
  if (!item) throw new Error(`No Signal ${title}`)
  return item
}

describe('Signals', () => {
  it('shows each Signal with its title as the link out, and its date', () => {
    renderSignals()

    const link = within(row(SLOW.title)).getByRole('link', {
      name: SLOW.title,
    })

    expect(screen.getByRole('heading', { name: 'Signals' })).toBeTruthy()
    expect(link.getAttribute('href')).toBe(SLOW.url)
    expect(within(row(SLOW.title)).getByText('2026-10-02')).toBeTruthy()
  })

  it('shows the Insight that a Signal grew into, in place of its checkbox', async () => {
    const onOpenInsight = vi.fn(
      (_id: string, event: { preventDefault: () => void }) =>
        event.preventDefault(),
    )
    renderSignals({ onOpenInsight })

    const grown = within(row(GROWN.title))
    const insight = grown.getByRole('link', {
      name: 'I4 Search needs synonyms',
    })
    await userEvent.click(insight)

    expect(insight.getAttribute('href')).toBe('#I4')
    expect(grown.queryByRole('checkbox')).toBeNull()
    expect(onOpenInsight).toHaveBeenCalledWith('I4', expect.anything())
  })

  it('makes an Insight from the picked Signals', async () => {
    const { onMakeInsight } = renderSignals()
    const make = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Make Insight',
    })

    expect(make.disabled).toBe(true)

    await userEvent.click(screen.getByRole('checkbox', { name: LOST.title }))
    await userEvent.click(screen.getByRole('checkbox', { name: SLOW.title }))
    await userEvent.click(make)

    // The order of the list, not the order of the clicks.
    expect(onMakeInsight).toHaveBeenCalledWith([SLOW.url, LOST.url])
  })

  it('says that there are no Signals, with no button', () => {
    renderSignals({ signals: [] })

    expect(screen.getByText('No Signals')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says why there are no Signals', () => {
    renderSignals({ signals: [], reason: 'The Project has no repository' })

    expect(screen.getByText('The Project has no repository')).toBeTruthy()
  })
})
