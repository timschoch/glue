// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { PartFormBody } from './part-form-body.tsx'
import type { PartFormPart } from './part-search.tsx'

const PARTS: Array<PartFormPart> = [
  {
    id: 'G2',
    type: 'goal',
    title: 'First bake feels easy',
    trust: 'solid',
    href: '#G2',
  },
  {
    id: 'I7',
    type: 'insight',
    title: 'Bakers want step videos',
    trust: 'solid',
    href: '#I7',
  },
  {
    id: 'I9',
    type: 'insight',
    title: 'Videos are too long',
    trust: 'not-ready',
    href: '#I9',
  },
]

// Carbon's text area watches its size, which jsdom can not do.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
)

afterEach(cleanup)

// The field with the state of its caller.
function Body({ start }: { start: string }) {
  const [value, setValue] = useState(start)
  return (
    <PartFormBody
      id="body"
      label="Body"
      value={value}
      parts={PARTS}
      onChange={setValue}
    />
  )
}

function renderBody(start = '') {
  render(<Body start={start} />)
}

const field = () => screen.getByRole<HTMLTextAreaElement>('textbox')

// jsdom has no layout, so Carbon holds the list back as hidden, and a hidden
// element has no name.
const list = () => screen.queryByLabelText('Records')

const options = () =>
  screen
    .getAllByRole('option', { hidden: true })
    .map((option) => option.textContent)

describe('PartFormBody', () => {
  it('shows no list before a #', async () => {
    renderBody()

    await userEvent.type(field(), 'It builds on I7')

    expect(list()).toBeNull()
  })

  it('opens the list of the Parts after a #, each with its type, its record id and its title', async () => {
    renderBody()

    await userEvent.type(field(), 'It builds on #')

    expect(options()).toEqual([
      'Goal G2 First bake feels easy',
      'Insight I7 Bakers want step videos',
      'Insight I9 Videos are too long',
    ])
  })

  it.each([
    ['the record id', '#i9'],
    ['the title', '#long'],
  ])('filters the list by %s', async (_, words) => {
    renderBody()

    await userEvent.type(field(), words)

    expect(options()).toEqual(['Insight I9 Videos are too long'])
  })

  it('closes the list when no Part matches', async () => {
    renderBody()

    await userEvent.type(field(), '#12')

    expect(list()).toBeNull()
  })

  it('opens no list after a # in a word', async () => {
    renderBody()

    await userEvent.type(field(), 'flexibeck#')

    expect(list()).toBeNull()
  })

  it('picks the first Part with Enter, and puts its record id into the text', async () => {
    renderBody()

    await userEvent.type(field(), 'It builds on #vid{Enter}')

    expect(field().value).toBe('It builds on #I7')
    expect(list()).toBeNull()
  })

  it('moves through the list with the arrow keys', async () => {
    renderBody()

    await userEvent.type(field(), '#')

    const active = () =>
      document.getElementById(
        field().getAttribute('aria-activedescendant') ?? '',
      )?.textContent

    expect(active()).toBe('Goal G2 First bake feels easy')

    await userEvent.keyboard('{ArrowDown}{ArrowDown}')

    expect(active()).toBe('Insight I9 Videos are too long')

    await userEvent.keyboard('{ArrowUp}{Enter}')

    expect(field().value).toBe('#I7')
  })

  it('picks a Part with a click, and keeps the focus in the field', async () => {
    renderBody()

    await userEvent.type(field(), '#')
    await userEvent.click(screen.getByText('Videos are too long'))

    expect(field().value).toBe('#I9')
    expect(document.activeElement).toBe(field())
  })

  it('puts the record id at the caret, before the text that follows', async () => {
    renderBody('See  first.')

    await userEvent.type(field(), '#g{Enter}now', {
      initialSelectionStart: 4,
      initialSelectionEnd: 4,
    })

    expect(field().value).toBe('See #G2now first.')
  })

  it('closes the list with Escape, and keeps the text', async () => {
    renderBody()

    await userEvent.type(field(), '#i{Escape}')

    expect(list()).toBeNull()
    expect(field().value).toBe('#i')

    await userEvent.keyboard('{Enter}')

    expect(field().value).toBe('#i\n')
  })
})
