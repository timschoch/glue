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
  source: 'github',
  insight: null,
}

const LOST: SignalRow = {
  url: 'https://github.com/timschoch/glue/issues/5',
  title: 'I lose my place in the list',
  date: '2026-10-01',
  source: 'github',
  insight: null,
}

const GROWN: SignalRow = {
  url: 'https://github.com/timschoch/glue/issues/3',
  title: 'The search finds nothing',
  date: '2026-09-30',
  source: 'github',
  insight: { id: 'I4', title: 'Search needs synonyms', href: '#I4' },
}

const TICKET: SignalRow = {
  url: 'https://support.test/agent/tickets/4',
  title: 'I cannot find the export',
  date: '2026-09-29',
  source: 'support',
  insight: null,
}

const ANSWER: SignalRow = {
  url: 'https://analytics.test/events/1',
  title: 'Survey answer 2 of 7',
  date: '2026-09-28',
  source: 'analytics',
  insight: null,
}

function titles() {
  return screen
    .getAllByRole('listitem')
    .map((item) => within(item).getAllByRole('link')[0].textContent)
}

function filter(name: string) {
  return screen.getByRole('button', { name })
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

    screen.getByRole('heading', { name: 'Signals' })
    expect(link.getAttribute('href')).toBe(SLOW.url)
    within(row(SLOW.title)).getByText('2026-10-02')
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

    screen.getByText('No Signals')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the source of each Signal', () => {
    renderSignals({ signals: [SLOW, TICKET, ANSWER] })

    within(row(SLOW.title)).getByText('GitHub')
    within(row(TICKET.title)).getByText('Support')
    within(row(ANSWER.title)).getByText('Analytics')
  })

  it('shows the Signals of the picked source only', async () => {
    renderSignals({ signals: [SLOW, LOST, TICKET, ANSWER] })

    expect(filter('Support').getAttribute('aria-pressed')).toBe('false')

    await userEvent.click(filter('Support'))

    expect(filter('Support').getAttribute('aria-pressed')).toBe('true')
    expect(titles()).toEqual([TICKET.title])
  })

  it('shows the Signals of each picked source', async () => {
    renderSignals({ signals: [SLOW, LOST, TICKET, ANSWER] })

    await userEvent.click(filter('Support'))
    await userEvent.click(filter('GitHub'))

    expect(titles()).toEqual([SLOW.title, LOST.title, TICKET.title])
  })

  it('shows all Signals again when no source is picked', async () => {
    renderSignals({ signals: [SLOW, TICKET] })

    await userEvent.click(filter('Support'))
    await userEvent.click(filter('Support'))

    expect(titles()).toEqual([SLOW.title, TICKET.title])
  })

  it('has one filter for each source with Signals, in the order of the names', () => {
    renderSignals({ signals: [TICKET, SLOW] })

    const filters = within(screen.getByRole('group', { name: 'Source' }))

    expect(
      filters.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['GitHub', 'Support'])
  })

  it('has no filter when the Signals come from one source', () => {
    renderSignals()

    expect(screen.queryByRole('button', { name: 'GitHub' })).toBeNull()
  })

  it('names the source that failed, and shows the Signals of the others', () => {
    renderSignals({
      signals: [TICKET],
      failures: [{ source: 'github', reason: 'GitHub answered 503' }],
    })

    const failure = screen.getByRole('status')
    within(failure).getByText('GitHub')
    within(failure).getByText('GitHub answered 503')
    expect(titles()).toEqual([TICKET.title])
  })

  it('names the source that failed when there are no Signals', () => {
    renderSignals({
      signals: [],
      failures: [{ source: 'support', reason: 'support answered 500' }],
    })

    within(screen.getByRole('status')).getByText('support answered 500')
    expect(screen.queryByText('No Signals')).toBeNull()
  })
})
