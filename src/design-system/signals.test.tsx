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

// The button that turns the group of a Signal into a Hunch.
function hunchButton({ title }: SignalRow) {
  return screen.getByRole('button', { name: `Make Hunch, ${title}` })
}

function filter(name: string) {
  return screen.getByRole('button', { name })
}

afterEach(cleanup)

function renderSignals(props: Partial<Parameters<typeof Signals>[0]> = {}) {
  const onMakeInsight = vi.fn()
  const onMakeHunch = vi.fn()
  const toSignals = (changed: typeof props) => (
    <Signals
      signals={[SLOW, LOST, GROWN]}
      onMakeInsight={onMakeInsight}
      onMakeHunch={onMakeHunch}
      {...changed}
    />
  )
  const { rerender } = render(toSignals(props))
  return {
    onMakeInsight,
    onMakeHunch,
    rerender: (changed: typeof props) => rerender(toSignals(changed)),
  }
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

  it('shows each group first with the count of its sources, then the single Signals', () => {
    renderSignals({
      signals: [SLOW, LOST, GROWN, TICKET],
      groups: [{ title: SLOW.title, signals: [SLOW.url, TICKET.url] }],
    })

    expect(titles()).toEqual([
      SLOW.title,
      TICKET.title,
      LOST.title,
      GROWN.title,
    ])
    screen.getByText('2 sources')
  })

  it('turns a group into a Hunch with one button', async () => {
    const { onMakeHunch } = renderSignals({
      signals: [SLOW, LOST, GROWN],
      groups: [{ title: SLOW.title, signals: [SLOW.url, LOST.url] }],
    })

    screen.getByText('1 source')
    await userEvent.click(hunchButton(SLOW))

    expect(onMakeHunch).toHaveBeenCalledWith([SLOW.url, LOST.url])
  })

  it('shows the title of a group as a heading over its Signals, and in the name of its button', () => {
    const title = 'Too many options to pick from'
    renderSignals({
      signals: [SLOW, TICKET, ANSWER],
      groups: [{ title, signals: [TICKET.url, ANSWER.url] }],
    })

    const heading = screen.getByRole('heading', { level: 3, name: title })

    expect(
      heading.compareDocumentPosition(row(TICKET.title)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    screen.getByRole('button', { name: `Make Hunch, ${title}` })
  })

  it('names the group in the name of its button, and makes no landmark of a group', () => {
    renderSignals({
      signals: [SLOW, LOST, TICKET, ANSWER],
      groups: [
        { title: SLOW.title, signals: [SLOW.url, LOST.url] },
        { title: TICKET.title, signals: [TICKET.url, ANSWER.url] },
      ],
    })

    hunchButton(SLOW)
    hunchButton(TICKET)
    expect(screen.getAllByRole('region')).toHaveLength(1)
  })

  it('shows that a Hunch saves in place of the button of its group', () => {
    renderSignals({
      signals: [SLOW, LOST, TICKET, ANSWER],
      groups: [
        { title: SLOW.title, signals: [SLOW.url, LOST.url] },
        { title: TICKET.title, signals: [TICKET.url, ANSWER.url] },
      ],
      hunch: { group: TICKET.url, pending: 'Saving' },
    })

    screen.getByText('Saving')
    expect(
      screen.queryByRole('button', { name: `Make Hunch, ${TICKET.title}` }),
    ).toBeNull()
    expect(hunchButton(SLOW)).toHaveProperty('disabled', true)
  })

  it('shows why a Hunch was not made at its group', () => {
    renderSignals({
      signals: [SLOW, LOST, TICKET, ANSWER],
      groups: [
        { title: SLOW.title, signals: [SLOW.url, LOST.url] },
        { title: TICKET.title, signals: [TICKET.url, ANSWER.url] },
      ],
      hunch: { group: TICKET.url, failure: 'Glue is not available' },
    })
    const failure = screen.getByText('Glue is not available')
    const isBefore = (first: Element, second: Element) =>
      Boolean(
        first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      )

    expect(isBefore(row(LOST.title), failure)).toBe(true)
    expect(isBefore(hunchButton(TICKET), failure)).toBe(true)
    expect(isBefore(failure, row(TICKET.title))).toBe(true)
  })

  it('shows no list of single Signals when each Signal is in a group', () => {
    renderSignals({
      signals: [SLOW, LOST],
      groups: [{ title: SLOW.title, signals: [SLOW.url, LOST.url] }],
    })

    expect(screen.getAllByRole('list')).toHaveLength(1)
  })

  it('shows a group only when the filters show two of its Signals', async () => {
    renderSignals({
      signals: [SLOW, LOST, TICKET],
      groups: [{ title: SLOW.title, signals: [SLOW.url, TICKET.url] }],
    })

    await userEvent.click(filter('GitHub'))

    expect(screen.queryByRole('button', { name: /Make Hunch/ })).toBeNull()
    expect(titles()).toEqual([SLOW.title, LOST.title])
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

    // The reason names GitHub already: the notice names it one time.
    expect(
      within(screen.getByRole('status'))
        .getAllByText(/GitHub/)
        .map((named) => named.textContent),
    ).toEqual(['GitHub answered 503'])
    expect(titles()).toEqual([TICKET.title])
  })

  it('names the source in front of a reason that does not name it', () => {
    renderSignals({
      signals: [SLOW],
      failures: [{ source: 'support', reason: 'The read took too long' }],
    })

    const failure = within(screen.getByRole('status'))
    failure.getByText('Support')
    failure.getByText('The read took too long')
  })

  it('names the source that failed when there are no Signals', () => {
    renderSignals({
      signals: [],
      failures: [{ source: 'support', reason: 'Support answered 500' }],
    })

    within(screen.getByRole('status')).getByText('Support answered 500')
    expect(screen.queryByText('No Signals')).toBeNull()
  })

  it('keeps the filter of a source that failed', () => {
    renderSignals({
      signals: [TICKET, ANSWER],
      failures: [{ source: 'github', reason: 'GitHub answered 503' }],
    })

    const filters = within(screen.getByRole('group', { name: 'Source' }))

    expect(
      filters.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Analytics', 'GitHub', 'Support'])
  })

  it('drops the filter of a source that went away', async () => {
    const { rerender } = renderSignals({ signals: [SLOW, TICKET, ANSWER] })

    await userEvent.click(filter('GitHub'))
    rerender({ signals: [TICKET, ANSWER] })

    expect(titles()).toEqual([TICKET.title, ANSWER.title])
    expect(filter('Support').getAttribute('aria-pressed')).toBe('false')
  })

  it('drops the pick of a Signal that the filter hides', async () => {
    const { onMakeInsight } = renderSignals({ signals: [SLOW, TICKET] })

    await userEvent.click(screen.getByRole('checkbox', { name: SLOW.title }))
    await userEvent.click(screen.getByRole('checkbox', { name: TICKET.title }))
    await userEvent.click(filter('Support'))
    await userEvent.click(screen.getByRole('button', { name: 'Make Insight' }))

    expect(onMakeInsight).toHaveBeenCalledWith([TICKET.url])

    await userEvent.click(filter('Support'))

    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: SLOW.title })
        .checked,
    ).toBe(false)
  })
})
