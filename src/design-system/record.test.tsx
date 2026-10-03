// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { Record } from './record.tsx'
import type { RecordPart, RecordPartSummary } from './record.tsx'

const INSIGHT: RecordPartSummary = {
  id: 'I7',
  type: 'insight',
  title: 'Bakers want step videos',
  concept: 'Technique videos',
  trust: 'solid',
  workState: 'published',
  href: '#I7',
}

const GOAL: RecordPartSummary = {
  id: 'G2',
  type: 'goal',
  title: 'First bake feels easy',
  concept: 'First bake',
  trust: 'flagged',
  href: '#G2',
}

const FLOW: RecordPartSummary = {
  id: 'F5',
  type: 'flow',
  title: 'Watch a technique while baking',
  concept: 'Technique videos',
  trust: 'not-ready',
  href: '#F5',
}

const DECISION: RecordPart = {
  id: 'D12',
  type: 'decision',
  title: 'Show the video of the creator',
  concept: 'Technique videos',
  trust: 'solid',
  workState: 'published',
  href: '#D12',
  body: '',
  owner: 'Mara',
  date: '2026-10-03',
  source: null,
  metric: null,
  enforcedBy: null,
  evidenceLevel: null,
  issueUrl: null,
  measure: null,
  supersededBy: null,
  supersedes: [],
  needs: [],
  neededBy: [],
}

afterEach(cleanup)

function renderRecord(
  part: Partial<RecordPart> = {},
  props: Partial<Parameters<typeof Record>[0]> = {},
) {
  render(
    <Record
      part={{ ...DECISION, ...part }}
      pinned={false}
      onPinChange={() => {}}
      {...props}
    />,
  )
}

// A part of the record: the head is its `header`, the type fields its `dl`.
function inRecord(name: 'header' | 'dl'): HTMLElement {
  const element = screen.getByRole('article').querySelector(name)
  if (!element) throw new Error(`The record has no ${name}`)
  return element
}

// The pin control. Its name is its Carbon tooltip, which jsdom does not read
// while the tooltip is closed.
function pinToggle(pressed: boolean): HTMLElement {
  const pin = screen.getByRole('button', { pressed })
  const name = pin.getAttribute('aria-labelledby') ?? ''
  expect(document.getElementById(name)?.textContent).toBe('Pin')
  return pin
}

// The texts of an element, in the order of the document. The name of the pin
// control is no text of the record.
function texts(element: HTMLElement): Array<string> {
  return [...element.querySelectorAll('span, h1, time, dt, dd')]
    .filter((child) => child.children.length === 0)
    .filter((child) => child.closest('[class*="tooltip"]') === null)
    .map((child) => child.textContent)
}

// The titles of the cards of a group.
function cards(group: string): Array<string | null> {
  return within(screen.getByRole('region', { name: group }))
    .getAllByRole('link')
    .map((card) => card.querySelector('p')?.textContent ?? null)
}

describe('Record', () => {
  it('shows the head: Trust word, type line, title, Work state, owner, date', () => {
    renderRecord()

    const head = inRecord('header')

    expect(texts(head)).toEqual([
      'Solid',
      'Decision',
      'D12',
      'Show the video of the creator',
      'Published',
      'Mara',
      '2026-10-03',
    ])
    expect(within(head).getByRole('heading', { level: 1 }).textContent).toBe(
      'Show the video of the creator',
    )
  })

  it.each([
    ['insight', 'Insight'],
    ['goal', 'Goal'],
    ['decision', 'Decision'],
    ['guardrail', 'Guardrail'],
    ['entity', 'Entity'],
    ['flow', 'Flow'],
    ['metric', 'Metric'],
  ] as const)('names the Part type of a %s', (type, word) => {
    renderRecord({ type })

    expect(texts(inRecord('header'))[1]).toBe(word)
  })

  it.each([
    ['solid', 'Solid'],
    ['flagged', 'Flagged'],
    ['not-ready', 'Not ready'],
    ['wrong', 'Wrong'],
  ] as const)(
    'shows the Trust %s as one glyph with its word as text',
    (trust, word) => {
      renderRecord({ trust })

      const head = inRecord('header')

      expect(head.firstElementChild?.firstElementChild?.tagName).toBe('svg')
      expect(texts(head)[0]).toBe(word)
    },
  )

  it('leaves out a head slot that has no value', () => {
    renderRecord({ workState: undefined, owner: null, date: null })

    expect(texts(inRecord('header'))).toEqual([
      'Solid',
      'Decision',
      'D12',
      'Show the video of the creator',
    ])
  })

  it('never puts a link in the title', () => {
    renderRecord({ title: 'Replace #I7' }, { bodyParts: [INSIGHT] })

    expect(within(inRecord('header')).queryByRole('link')).toBeNull()
  })

  it('pins with a toggle', async () => {
    const onPinChange = vi.fn()
    renderRecord({}, { onPinChange })

    await userEvent.click(pinToggle(false))

    expect(onPinChange).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('takes the pin off with the same toggle', async () => {
    const onPinChange = vi.fn()
    renderRecord({}, { pinned: true, onPinChange })

    await userEvent.click(pinToggle(true))

    expect(onPinChange).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('shows the body as Markdown, without an image', () => {
    renderRecord({
      body: '## Why\n\nA baker **sees** the hands.\n\n- one\n- two\n\n![](https://example.com/a.png)',
    })

    expect(screen.getByRole('heading', { name: 'Why' })).toBeDefined()
    expect(screen.getByText('sees').tagName).toBe('STRONG')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows a record id with # in the body as a link to that record', async () => {
    const onOpen = vi.fn()
    renderRecord(
      { body: 'It builds on #I7 and on #G2.' },
      { bodyParts: [INSIGHT, GOAL], onOpen },
    )

    const link = screen.getByRole('link', { name: '#I7' })

    expect(link.getAttribute('href')).toBe('#I7')
    expect(screen.getByRole('link', { name: '#G2' })).toBeDefined()

    await userEvent.click(link)

    expect(onOpen).toHaveBeenCalledOnce()
    expect(onOpen.mock.calls[0][0]).toBe('I7')
  })

  it('keeps a record id as text in code, in a link, and when the record is not known', () => {
    renderRecord(
      { body: 'See `#I7`, [the #I7 study](https://example.com) and #D99.' },
      { bodyParts: [INSIGHT] },
    )

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(
      ['the #I7 study'],
    )
  })

  it('shows the minimal card while the pointer is on the record id or on the card', async () => {
    renderRecord({ body: 'It builds on #I7.' }, { bodyParts: [INSIGHT] })

    const link = screen.getByRole('link', { name: '#I7' })

    expect(screen.queryByText('Bakers want step videos')).toBeNull()

    await userEvent.hover(link)

    const card = screen.getByText('Bakers want step videos').closest('a')

    expect(card && texts(card)).toEqual(['Insight', 'I7'])
    expect(within(card!).getByRole('img', { name: 'Solid' })).toBeDefined()

    await userEvent.hover(card!)

    expect(screen.getByText('Bakers want step videos')).toBeDefined()

    await userEvent.unhover(card!)

    expect(screen.queryByText('Bakers want step videos')).toBeNull()
  })

  it('shows the minimal card while the focus is on the record id, and closes it with Escape', async () => {
    renderRecord({ body: 'It builds on #I7.' }, { bodyParts: [INSIGHT] })

    await userEvent.tab()
    await userEvent.tab()

    expect(document.activeElement).toBe(
      screen.getByRole('link', { name: '#I7' }),
    )
    expect(screen.getByText('Bakers want step videos')).toBeDefined()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByText('Bakers want step videos')).toBeNull()
  })

  it('closes the minimal card when the focus leaves', async () => {
    renderRecord(
      { body: 'It builds on #I7 and #G2.' },
      { bodyParts: [INSIGHT, GOAL] },
    )

    await userEvent.tab()
    await userEvent.tab()
    await userEvent.tab()

    expect(document.activeElement).toBe(
      screen.getByText('Bakers want step videos').closest('a'),
    )

    await userEvent.tab()

    expect(document.activeElement).toBe(
      screen.getByRole('link', { name: '#G2' }),
    )
    expect(screen.queryByText('Bakers want step videos')).toBeNull()
    expect(screen.getByText('First bake feels easy')).toBeDefined()
  })

  it('shows no type field when none has a value', () => {
    renderRecord()

    expect(screen.queryByRole('term')).toBeNull()
  })

  it('shows the metric and the measure of a Goal', () => {
    renderRecord({
      type: 'goal',
      metric: 'Ease of the first bake',
      measure: {
        baseline: 3.2,
        latestValue: 3.8,
        target: 4.2,
        measuredAt: '2026-10-02',
      },
    })

    expect(texts(inRecord('dl'))).toEqual([
      'Metric',
      'Ease of the first bake',
      'Baseline',
      '3.2',
      'Latest value',
      '3.8',
      'Target',
      '4.2',
      'Measured',
      '2026-10-02',
    ])
  })

  it('leaves out a value of the measure that is not there yet', () => {
    renderRecord({
      type: 'goal',
      metric: 'Ease of the first bake',
      measure: {
        baseline: null,
        latestValue: null,
        target: 4.2,
        measuredAt: null,
      },
    })

    expect(texts(inRecord('dl'))).toEqual([
      'Metric',
      'Ease of the first bake',
      'Target',
      '4.2',
    ])
  })

  it('shows what enforces a Guardrail', () => {
    renderRecord({ type: 'guardrail', enforcedBy: 'A test of the player' })

    expect(texts(inRecord('dl'))).toEqual([
      'Enforced by',
      'A test of the player',
    ])
  })

  it('shows the Evidence level and the source of an Insight', () => {
    renderRecord({
      type: 'insight',
      evidenceLevel: 'pattern',
      source: 'Interviews, May',
    })

    expect(texts(inRecord('dl'))).toEqual([
      'Evidence level',
      'Pattern',
      'Source',
      'Interviews, May',
    ])
  })

  it('shows the issue of a Decision as a link', () => {
    renderRecord({ issueUrl: 'https://github.com/timschoch/glue/issues/162' })

    expect(screen.getByRole('term').textContent).toBe('Issue')
    expect(
      screen
        .getByRole('link', {
          name: 'https://github.com/timschoch/glue/issues/162',
        })
        .getAttribute('href'),
    ).toBe('https://github.com/timschoch/glue/issues/162')
  })

  it('shows the Joints as two groups of cards: needs and needed by', async () => {
    const onOpen = vi.fn()
    renderRecord(
      {
        needs: [
          { jointId: 1, link: false, part: INSIGHT },
          { jointId: 2, link: false, part: GOAL },
        ],
        neededBy: [{ jointId: 3, link: false, part: FLOW }],
      },
      { onOpen },
    )

    expect(cards('Needs')).toEqual([
      'Bakers want step videos',
      'First bake feels easy',
    ])
    expect(cards('Needed by')).toEqual(['Watch a technique while baking'])

    await userEvent.click(screen.getByText('First bake feels easy'))

    expect(onOpen).toHaveBeenCalledOnce()
    expect(onOpen.mock.calls[0][0]).toBe('G2')
  })

  it('names the Concept of a Part that a link joins', () => {
    renderRecord({
      needs: [
        { jointId: 1, link: false, part: INSIGHT },
        { jointId: 2, link: true, part: GOAL },
      ],
    })

    const [local, linked] = within(
      screen.getByRole('region', { name: 'Needs' }),
    ).getAllByRole('listitem')

    expect(within(local).queryByText('Technique videos')).toBeNull()
    expect(within(linked).getByText('First bake')).toBeDefined()
  })

  it('shows the Decision that supersedes it and the Decisions it supersedes', () => {
    renderRecord({
      supersededBy: { ...GOAL, id: 'D14', type: 'decision', title: 'Newer' },
      supersedes: [{ ...GOAL, id: 'D3', type: 'decision', title: 'Older' }],
    })

    expect(cards('Superseded by')).toEqual(['Newer'])
    expect(cards('Supersedes')).toEqual(['Older'])
  })

  it('leaves out a group with no item', () => {
    renderRecord()

    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
    expect([...screen.getByRole('article').children]).toEqual([
      inRecord('header'),
    ])
  })

  it('holds the one button of the Work state', async () => {
    const onClick = vi.fn()
    renderRecord({}, { action: { label: 'Sign off', onClick } })

    await userEvent.click(screen.getByRole('button', { name: 'Sign off' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('has no button but the pin when no action is given', () => {
    renderRecord()

    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
