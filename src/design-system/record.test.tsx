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
  signals: [],
  flags: [],
  activity: [],
  question: null,
  unchosen: false,
}

const QUESTION = {
  options: ['Cache it', 'Render on the edge', 'Do nothing'],
  pick: 2,
  answer: null,
}

// Carbon's dialog watches its size, which jsdom can not do.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
)

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

// A control with an icon alone, found by its Carbon tooltip.
function iconButtons(name: string): Array<HTMLElement> {
  return screen.getAllByRole('button').filter((button) => {
    const label = button.getAttribute('aria-labelledby') ?? ''
    return document.getElementById(label)?.textContent === name
  })
}

function iconButton(name: string): HTMLElement {
  const [button, ...others] = iconButtons(name)
  expect(others).toEqual([])
  expect(button).toBeDefined()
  return button
}

// The items of the open menu. jsdom has no layout, so Carbon never gets to
// the place of the menu and keeps it out of the accessibility tree.
const menuItems = () => screen.getAllByRole('menuitem', { hidden: true })

const JOINTS = {
  needs: [{ jointId: 1, link: false, part: INSIGHT }],
  neededBy: [{ jointId: 3, link: false, part: FLOW }],
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

  it('lets a member watch and stop, with the count of the watchers in the control', async () => {
    const onChange = vi.fn()
    renderRecord({}, { watch: { watching: false, count: 2, onChange } })

    const watch = screen.getByRole('button', { name: 'Watch 2' })

    expect(watch.textContent).toBe('2')
    expect(watch.getAttribute('aria-pressed')).toBe('false')

    await userEvent.click(watch)

    expect(onChange).toHaveBeenCalledExactlyOnceWith(true)

    cleanup()
    renderRecord({}, { watch: { watching: true, count: 3, onChange } })

    const stop = screen.getByRole('button', { name: 'Watch 3' })

    expect(stop.textContent).toBe('3')
    expect(stop.getAttribute('aria-pressed')).toBe('true')

    await userEvent.click(stop)

    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('shows the watch control of a Part that nobody watches with no error in the console', () => {
    const logged = vi.spyOn(console, 'error')
    renderRecord(
      {},
      { watch: { watching: false, count: 0, onChange: () => {} } },
    )

    expect(screen.getByRole('button', { name: 'Watch 0' }).textContent).toBe(
      '0',
    )
    expect(logged).not.toHaveBeenCalled()
    logged.mockRestore()
  })

  it('shows an action with an address as a link', () => {
    renderRecord(
      {},
      { actions: [{ label: 'Ask Mara', href: 'mailto:mara@example.com' }] },
    )

    expect(
      screen.getByRole('link', { name: 'Ask Mara' }).getAttribute('href'),
    ).toBe('mailto:mara@example.com')
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

    screen.getByRole('heading', { name: 'Why' })
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
    screen.getByRole('link', { name: '#G2' })

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
    within(card!).getByRole('img', { name: 'Solid' })

    await userEvent.hover(card!)

    screen.getByText('Bakers want step videos')

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
    screen.getByText('Bakers want step videos')

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByText('Bakers want step videos')).toBeNull()
  })

  it('closes the minimal card when the focus leaves, and the card is no tab stop', async () => {
    renderRecord(
      { body: 'It builds on #I7 and #G2.' },
      { bodyParts: [INSIGHT, GOAL] },
    )

    await userEvent.tab()
    await userEvent.tab()

    screen.getByText('Bakers want step videos')

    await userEvent.tab()

    expect(document.activeElement).toBe(
      screen.getByRole('link', { name: '#G2' }),
    )
    expect(screen.queryByText('Bakers want step videos')).toBeNull()
    screen.getByText('First bake feels easy')
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

  it('shows the issue of a Decision as a link in the short form', () => {
    renderRecord({ issueUrl: 'https://github.com/timschoch/glue/issues/162' })

    expect(screen.getByRole('term').textContent).toBe('Issue')
    expect(
      screen.getByRole('link', { name: '#162' }).getAttribute('href'),
    ).toBe('https://github.com/timschoch/glue/issues/162')
  })

  it('shows an issue address with no number as it is', () => {
    renderRecord({ issueUrl: 'https://example.com/issues' })

    screen.getByRole('link', { name: 'https://example.com/issues' })
  })

  it('shows the Signals that an Insight grew from, each as a link out', () => {
    renderRecord({
      signals: [
        {
          url: 'https://github.com/timschoch/glue/issues/7',
          title: 'The list is slow',
        },
      ],
    })

    const group = screen.getByRole('region', { name: 'Signals' })
    const link = within(group).getByRole('link', { name: 'The list is slow' })

    expect(link.getAttribute('href')).toBe(
      'https://github.com/timschoch/glue/issues/7',
    )
  })

  it('has no group of Signals for a Part that grew from none', () => {
    renderRecord()

    expect(screen.queryByRole('region', { name: 'Signals' })).toBeNull()
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

  it('names the home Concept of a Part that a link joins, on its card', () => {
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
    within(within(linked).getByRole('link')).getByText('First bake')
    expect(linked.children).toHaveLength(1)
  })

  it('names the Project of a reference on its card, and leaves the open to its link', async () => {
    const onOpen = vi.fn()
    renderRecord(
      {
        needs: [
          {
            jointId: 2,
            link: true,
            project: 'Glue',
            part: { ...GOAL, href: '/glue/first-bake/G2' },
          },
        ],
      },
      { onOpen },
    )

    const card = within(
      screen.getByRole('region', { name: 'Needs' }),
    ).getByRole('link', { name: /First bake feels easy/ })

    within(card).getByText('Glue')
    expect(within(card).queryByText('First bake')).toBeNull()
    expect(card.getAttribute('href')).toBe('/glue/first-bake/G2')

    card.addEventListener('click', (event) => event.preventDefault())
    await userEvent.click(card)

    expect(onOpen).not.toHaveBeenCalled()
  })

  it('offers a Part with the record id of a reference for a new Joint', async () => {
    renderRecord(
      { needs: [{ jointId: 2, link: true, project: 'Glue', part: GOAL }] },
      { jointParts: [DECISION, GOAL], onAddJoint: () => {} },
    )

    await userEvent.click(screen.getByRole('combobox', { name: 'Add Joint' }))

    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['G2 First bake feels easy'])
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
    renderRecord({}, { actions: [{ label: 'Sign off', onClick }] })

    const button = screen.getByRole('button', { name: 'Sign off' })

    expect(button.className).toContain('btn--primary')
    // The pin and the button: one action has no menu.
    expect(screen.getAllByRole('button')).toHaveLength(2)

    await userEvent.click(button)

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('holds the other actions in the menu of the button', async () => {
    const onSignOff = vi.fn()
    const onSink = vi.fn()
    const onRemove = vi.fn()
    renderRecord(
      {},
      {
        actions: [
          { label: 'Sign off', onClick: onSignOff },
          { label: 'Sink', onClick: onSink },
          { label: 'Remove', onClick: onRemove },
        ],
      },
    )

    expect(screen.queryByRole('menuitem')).toBeNull()

    // The pin, the button and the control that opens its menu.
    const [, button, menu] = screen.getAllByRole('button')

    expect(button.textContent).toBe('Sign off')

    await userEvent.click(menu)

    expect(menuItems().map((item) => item.textContent)).toEqual([
      'Sink',
      'Remove',
    ])

    await userEvent.click(menuItems()[0])

    expect(onSink).toHaveBeenCalledOnce()

    await userEvent.click(button)

    expect(onSignOff).toHaveBeenCalledOnce()
    expect(onRemove).not.toHaveBeenCalled()
  })

  it('asks before an action that cannot be undone, and runs it on the button of the dialog', async () => {
    const onClick = vi.fn()
    renderRecord(
      {},
      {
        actions: [
          {
            label: 'Remove',
            onClick,
            confirm: { title: 'Remove D12?', label: 'Remove D12' },
          },
        ],
      },
    )

    expect(screen.queryByRole('dialog')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    const dialog = within(screen.getByRole('dialog', { name: 'Remove D12?' }))

    expect(onClick).not.toHaveBeenCalled()
    expect(
      dialog.getByRole('button', { name: 'Remove D12' }).className,
    ).toContain('btn--danger')

    await userEvent.click(dialog.getByRole('button', { name: 'Remove D12' }))

    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes the dialog on Cancel and leaves the action', async () => {
    const onClick = vi.fn()
    renderRecord(
      {},
      {
        actions: [
          { label: 'Sign off', onClick: () => {} },
          {
            label: 'Remove',
            onClick,
            confirm: { title: 'Remove D12?', label: 'Remove D12' },
          },
        ],
      },
    )

    await userEvent.click(screen.getAllByRole('button')[2])
    await userEvent.click(menuItems()[0])
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    )

    expect(onClick).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the words of the running action in place of the button', () => {
    renderRecord(
      {},
      {
        actions: [{ label: 'Sign off', onClick: () => {} }],
        pending: 'Signing off',
      },
    )

    screen.getByText('Signing off')
    expect(screen.queryByRole('button', { name: 'Sign off' })).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('shows the reason of a failed action in one alert below the button', () => {
    renderRecord(
      {},
      {
        actions: [{ label: 'Sign off', onClick: () => {} }],
        error: 'Not signed off: the Goal G2 is sunk',
      },
    )

    const alert = screen.getByRole('alert')
    const button = screen.getByRole('button', { name: 'Sign off' })

    within(alert).getByText('Not signed off: the Goal G2 is sunk')
    expect(alert.className).toContain('--error')
    expect(alert.className).toContain('--low-contrast')
    expect(within(alert).queryByRole('button')).toBeNull()
    expect(
      button.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('has no alert without a reason', () => {
    renderRecord({}, { actions: [{ label: 'Sign off', onClick: () => {} }] })

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('edits with the icon button beside the pin', async () => {
    const onEdit = vi.fn()
    renderRecord({}, { onEdit })

    const edit = iconButton('Edit')

    expect(edit.className).toContain('btn--ghost')
    expect(within(inRecord('header')).getAllByRole('button')).toEqual([
      edit,
      pinToggle(false),
    ])

    await userEvent.click(edit)

    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('has no control to edit without its callback', () => {
    renderRecord()

    expect(iconButtons('Edit')).toEqual([])
  })

  it('adds a Joint with a search in the group Needs, after its cards', async () => {
    const onAddJoint = vi.fn()
    renderRecord(JOINTS, {
      jointParts: [DECISION, INSIGHT, GOAL, FLOW],
      onAddJoint,
    })

    const needs = screen.getByRole('region', { name: 'Needs' })
    const search = within(needs).getByRole('combobox', { name: 'Add Joint' })

    expect(
      within(needs).getByRole('list').compareDocumentPosition(search) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getAllByRole('combobox')).toHaveLength(1)

    await userEvent.click(search)

    // Not the Part itself, and not a Part that a Joint holds already.
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['G2 First bake feels easy'])

    await userEvent.click(screen.getByRole('option'))

    expect(onAddJoint).toHaveBeenCalledExactlyOnceWith('G2')
  })

  it('shows the group Needs with the search alone when the Part needs nothing', () => {
    renderRecord({}, { jointParts: [GOAL], onAddJoint: () => {} })

    const needs = within(screen.getByRole('region', { name: 'Needs' }))

    needs.getByRole('combobox', { name: 'Add Joint' })
    expect(needs.queryByRole('list')).toBeNull()
    expect(screen.getAllByRole('region')).toHaveLength(1)
  })

  it('has no search without its callback', () => {
    renderRecord(JOINTS, { jointParts: [GOAL] })

    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('removes a Joint with the icon action on its card, in both groups', async () => {
    const onRemoveJoint = vi.fn()
    renderRecord(JOINTS, { onRemoveJoint })

    await userEvent.click(iconButton('Remove I7'))
    await userEvent.click(iconButton('Remove F5'))

    expect(onRemoveJoint.mock.calls).toEqual([[1], [3]])
    expect(
      screen
        .getByRole('region', { name: 'Needs' })
        .contains(iconButton('Remove I7')),
    ).toBe(true)
    expect(iconButton('Remove I7').querySelectorAll('svg')).toHaveLength(1)
  })

  it('has no icon action on a card that is no Joint, and none without the callback', () => {
    renderRecord(
      {
        supersededBy: { ...GOAL, id: 'D14', type: 'decision', title: 'Newer' },
        supersedes: [{ ...GOAL, id: 'D3', type: 'decision', title: 'Older' }],
      },
      { onRemoveJoint: () => {} },
    )

    expect(screen.getAllByRole('button')).toHaveLength(1)

    cleanup()
    renderRecord(JOINTS)

    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('has no button but the pin when no action is given', () => {
    renderRecord()

    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})

describe('the box Next', () => {
  const next = () => within(screen.getByRole('region', { name: 'Next' }))

  it('holds the one button, directly below the head', () => {
    renderRecord(
      { body: 'One video per step.' },
      { actions: [{ label: 'It is fine', onClick: () => {} }] },
    )

    expect(next().getAllByRole('button')).toHaveLength(1)
    expect(inRecord('header').nextElementSibling).toBe(
      screen.getByRole('region', { name: 'Next' }),
    )
  })

  it('is not there without an action', () => {
    renderRecord()

    expect(screen.queryByRole('region', { name: 'Next' })).toBeNull()
  })

  it('asks for the Part of an action that needs one, and gives its record id', async () => {
    const onPick = vi.fn()
    renderRecord(
      {},
      {
        jointParts: [DECISION, GOAL],
        actions: [{ label: 'Wait', pick: { label: 'Wait for', onPick } }],
      },
    )

    expect(screen.queryByRole('combobox')).toBeNull()

    await userEvent.click(next().getByRole('button', { name: 'Wait' }))
    await userEvent.click(next().getByRole('combobox', { name: 'Wait for' }))

    // Not the Part itself.
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['G2 First bake feels easy'])

    await userEvent.click(screen.getByRole('option'))

    expect(onPick).toHaveBeenCalledExactlyOnceWith('G2')
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('asks for the choice of an action that needs one, and gives its value', async () => {
    const onPick = vi.fn()
    renderRecord(
      {},
      {
        actions: [
          {
            label: 'Ask another team',
            choose: {
              label: 'Project',
              options: [
                { value: 'ux', text: 'UX team' },
                { value: 'data', text: 'Data team' },
              ],
              onPick,
            },
          },
        ],
      },
    )

    expect(screen.queryByRole('combobox')).toBeNull()

    await userEvent.click(
      next().getByRole('button', { name: 'Ask another team' }),
    )
    await userEvent.selectOptions(
      next().getByRole('combobox', { name: 'Project' }),
      'Data team',
    )

    expect(onPick).toHaveBeenCalledExactlyOnceWith('data')
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('takes an answer in words above the button', async () => {
    const onChange = vi.fn()
    renderRecord(
      {},
      {
        actions: [{ label: 'Sign off', onClick: () => {} }],
        words: { value: 'Yes', onChange },
      },
    )

    const field = next().getByRole('textbox', { name: 'Answer' })
    const button = next().getByRole('button', { name: 'Sign off' })

    expect(field).toHaveProperty('value', 'Yes')
    expect(
      field.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    await userEvent.type(field, '!')

    expect(onChange).toHaveBeenCalledExactlyOnceWith('Yes!')
  })
})

describe('the question of a Decision', () => {
  const next = () => within(screen.getByRole('region', { name: 'Next' }))

  it('shows the options as one choice in the box Next, the pick of the author first', async () => {
    const onChange = vi.fn()
    renderRecord(
      { question: QUESTION },
      {
        actions: [{ label: 'Answer', onClick: () => {} }],
        words: { value: '', onChange: () => {} },
        choice: { value: 2, onChange },
      },
    )

    const options = next().getAllByRole('radio')

    expect(
      options.map((option) => [
        option.closest('div')?.textContent,
        (option as HTMLInputElement).checked,
      ]),
    ).toEqual([
      ['Cache it', false],
      ['Render on the edge', true],
      ['Do nothing', false],
    ])
    expect(next().getByRole('textbox', { name: 'Answer' })).toBeDefined()
    expect(next().getAllByRole('button')).toHaveLength(1)

    await userEvent.click(next().getByRole('radio', { name: 'Do nothing' }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith(3)
  })

  it('shows the chosen option and who chose it, with the other options', () => {
    renderRecord({
      question: {
        ...QUESTION,
        answer: {
          option: 3,
          text: null,
          by: 'Ada',
          at: '2026-10-04T08:00:00.000Z',
        },
      },
    })

    const answer = within(screen.getByRole('region', { name: 'Answer' }))

    expect(
      answer
        .getAllByRole('listitem')
        .map((item) => [item.textContent, item.getAttribute('aria-current')]),
    ).toEqual([
      ['Cache it', null],
      ['Render on the edge', null],
      ['Do nothing', 'true'],
    ])
    expect(answer.getByText('Ada')).toBeDefined()
    expect(answer.getByText('2026-10-04')).toBeDefined()
  })

  it('shows an answer in words as the chosen one, after the options', () => {
    renderRecord({
      question: {
        ...QUESTION,
        answer: {
          option: null,
          text: 'Buy a CDN',
          by: 'Ada',
          at: '2026-10-04T08:00:00.000Z',
        },
      },
    })

    const answer = within(screen.getByRole('region', { name: 'Answer' }))

    expect(
      answer
        .getAllByRole('listitem')
        .map((item) => [item.textContent, item.getAttribute('aria-current')]),
    ).toEqual([
      ['Cache it', null],
      ['Render on the edge', null],
      ['Do nothing', null],
      ['Buy a CDN', 'true'],
    ])
  })

  it('lists the options of a question that nobody can answer now', () => {
    renderRecord({ question: QUESTION })

    expect(
      within(screen.getByRole('region', { name: 'Options' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(QUESTION.options)
  })

  it('says that a superseded Decision that was never accepted was not chosen', () => {
    renderRecord({ trust: 'wrong', unchosen: true })

    expect(texts(inRecord('header'))[0]).toBe('Not chosen')
  })
})

describe('the step bar of a record', () => {
  const flow = {
    name: 'Insight to Decision',
    steps: ['Set Goal', 'Choose', 'Sign'],
    current: 2,
  }

  it('sits between the head and the box Next', () => {
    renderRecord(
      {},
      { flow, actions: [{ label: 'Sign off', onClick: () => {} }] },
    )

    const bar = screen.getByRole('list', { name: 'Insight to Decision' })

    expect(inRecord('header').nextElementSibling).toBe(bar)
    expect(bar.nextElementSibling).toBe(
      screen.getByRole('region', { name: 'Next' }),
    )
    expect(
      within(bar)
        .getAllByRole('button')
        .filter((step) => step.getAttribute('aria-current') === 'step')
        .map((step) => step.title),
    ).toEqual(['Sign'])
  })

  it('is not there without a flow', () => {
    renderRecord()

    expect(screen.queryByRole('list')).toBeNull()
  })
})

describe('the activity of a record', () => {
  const activity = [
    { kind: 'changed', at: '2026-10-04T08:00:00.000Z' },
    {
      kind: 'flag-closed',
      at: '2026-10-03T09:00:00.000Z',
      flag: { reason: 'changed', part: INSIGHT },
    },
    {
      kind: 'flag-opened',
      at: '2026-10-03T08:00:00.000Z',
      flag: { reason: 'changed', part: INSIGHT },
    },
    { kind: 'published', at: '2026-10-02T08:00:00.000Z' },
  ] as const

  it('lists what happened and when, in the order given, as the last group', () => {
    renderRecord({ ...JOINTS, activity })

    const group = screen.getByRole('region', { name: 'Activity' })

    expect(
      within(group)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      '2026-10-04Edited',
      '2026-10-03Flag closedChangedI7',
      '2026-10-03Flag openedChangedI7',
      '2026-10-02Published',
    ])
    expect(screen.getByRole('article').lastElementChild).toBe(group)
  })

  it('opens the cause of a flag', async () => {
    const onOpen = vi.fn()
    renderRecord({ activity }, { onOpen })

    const [link] = within(
      screen.getByRole('region', { name: 'Activity' }),
    ).getAllByRole('link', { name: 'I7' })
    await userEvent.click(link)

    expect(link.getAttribute('href')).toBe('#I7')
    expect(onOpen).toHaveBeenCalledWith('I7', expect.anything())
  })

  it('has no group without an entry', () => {
    renderRecord()

    expect(screen.queryByRole('region', { name: 'Activity' })).toBeNull()
  })
})

describe('the flags of a record', () => {
  const flags = [
    { reason: 'changed', part: INSIGHT },
    { reason: 'not-ready', part: GOAL },
  ] as const

  it('lists each flag as its reason and the minimal card of its cause, below the box Next', () => {
    renderRecord(
      { trust: 'flagged', workState: 'to-check', flags },
      { actions: [{ label: 'It is fine', onClick: () => {} }] },
    )

    const list = screen.getByRole('list', { name: 'Flags' })

    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => texts(item)),
    ).toEqual([
      ['Changed', 'Insight', 'I7'],
      ['Not ready', 'Goal', 'G2'],
    ])
    expect(
      screen.getByRole('region', { name: 'Next' }).nextElementSibling,
    ).toBe(list)
  })

  it('opens the cause of a flag', async () => {
    const onOpen = vi.fn()
    renderRecord({ flags }, { onOpen })

    await userEvent.click(
      within(screen.getByRole('list', { name: 'Flags' })).getByRole('link', {
        name: / G2 /,
      }),
    )

    expect(onOpen).toHaveBeenCalledWith('G2', expect.anything())
  })

  it('has no list without a flag', () => {
    renderRecord()

    expect(screen.queryByRole('list', { name: 'Flags' })).toBeNull()
  })

  it('lists each empty slot as a reason, before the flags', () => {
    renderRecord({
      trust: 'flagged',
      emptySlots: ['goal', 'evidence'],
      flags: [flags[0]],
    })

    expect(
      within(screen.getByRole('list', { name: 'Flags' }))
        .getAllByRole('listitem')
        .map((item) => texts(item)),
    ).toEqual([
      ['Needs a Goal'],
      ['Needs evidence'],
      ['Changed', 'Insight', 'I7'],
    ])
  })

  it('shows the Parts under review in a group of their own, and not as flags', async () => {
    const onOpen = vi.fn()
    renderRecord({ reviewNotes: [GOAL] }, { onOpen })

    const group = screen.getByRole('region', { name: 'Review' })
    const link = within(group).getByRole('link', {
      name: /Goal G2 First bake feels easy/,
    })
    await userEvent.click(link)

    expect(link.getAttribute('href')).toBe('#G2')
    expect(onOpen).toHaveBeenCalledWith('G2', expect.anything())
    expect(screen.queryByRole('list', { name: 'Flags' })).toBeNull()
  })

  it('has no group Review when no needed Part is under review', () => {
    renderRecord()

    expect(screen.queryByRole('region', { name: 'Review' })).toBeNull()
  })

  const newVersion = [
    {
      reason: 'new-version',
      part: INSIGHT,
      contract: {
        builtWith: 1,
        newest: 2,
        changes: [
          {
            field: 'title',
            before: 'Bakers want videos',
            after: INSIGHT.title,
          },
          { field: 'owner', before: null, after: 'Mara' },
        ],
      },
    },
  ] as const

  it('shows the two Versions of a new Contract Version and what changed in the needed Part', () => {
    renderRecord({ trust: 'flagged', flags: newVersion })

    const [flag] = within(
      screen.getByRole('list', { name: 'Flags' }),
    ).getAllByRole('listitem')

    expect(within(flag).getByText('New Version')).toBeDefined()
    expect(
      within(flag)
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual(['Version', 'Title', 'Owner'])
    expect(
      within(flag)
        .getAllByRole('definition')
        .map((value) => [
          within(value).queryByRole('deletion')?.textContent,
          within(value).queryByRole('insertion')?.textContent,
        ]),
    ).toEqual([
      ['1', '2'],
      ['Bakers want videos', 'Bakers want step videos'],
      [undefined, 'Mara'],
    ])
  })

  it('answers a new Contract Version with a move to it', async () => {
    const onMoveToVersion = vi.fn()
    renderRecord({ flags: newVersion }, { onMoveToVersion })

    await userEvent.click(
      screen.getByRole('button', { name: 'Move to Version 2' }),
    )

    expect(onMoveToVersion).toHaveBeenCalledWith('I7', 2)
  })

  it('has no answer on a flag of another reason', () => {
    renderRecord({ flags }, { onMoveToVersion: () => {} })

    expect(screen.queryByRole('button', { name: /^Move to/ })).toBeNull()
  })
})
