// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { Card } from './card.tsx'
import type { CardProps } from './card.tsx'

// The g10 value of the first layer, from Carbon's theme table.
const LAYER_01 = '#ffffff'

const TOKEN = /^var\((--[\w-]+)/

const DECISION: CardProps = {
  type: 'decision',
  recordId: 'D12',
  title: 'Show the video of the creator',
  trust: 'solid',
  href: '#D12',
}

afterEach(cleanup)

// The value of a token at an element: the last rule that sets it on the
// element, or else on its nearest ancestor. jsdom does not inherit custom
// properties itself.
function tokenValue(element: HTMLElement, name: string): string {
  const rules = [...document.styleSheets]
    .flatMap((sheet) => [...sheet.cssRules])
    .filter((rule) => rule instanceof CSSStyleRule)
    .filter((rule) => rule.style.getPropertyValue(name) !== '')
  for (
    let ancestor: HTMLElement | null = element;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    const rule = rules
      .filter(({ selectorText }) => ancestor.matches(selectorText))
      .at(-1)
    if (rule) return rule.style.getPropertyValue(name).trim()
  }
  return ''
}

// The background colour of an element. jsdom keeps `var()` as written, so
// this follows the tokens to the value.
function layer(element: HTMLElement): string {
  let value = getComputedStyle(element).backgroundColor
  for (
    let token = TOKEN.exec(value);
    token !== null;
    token = TOKEN.exec(value)
  ) {
    value = tokenValue(element, token[1])
  }
  return value
}

// The outline an element gets with the focus. jsdom does not apply `:focus`
// rules itself.
function focusOutline(element: HTMLElement): string {
  const FOCUS = /:focus$/
  return (
    [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .filter((rule) => rule instanceof CSSStyleRule)
      .filter(
        ({ selectorText }) =>
          FOCUS.test(selectorText) &&
          element.matches(selectorText.replace(FOCUS, '')),
      )
      .at(-1)
      ?.style.getPropertyValue('outline') ?? ''
  )
}

// The texts of the card, in the order of the document.
function texts(card: HTMLElement): Array<string> {
  return [...card.querySelectorAll('span, p')]
    .filter((element) => element.children.length === 0)
    .map((element) => element.textContent)
}

describe('Card', () => {
  it('shows the sign, then the type line, then the title', () => {
    render(<Card {...DECISION} />)

    const card = screen.getByRole('link')

    expect(card.firstElementChild?.firstElementChild).toBe(
      within(card).getByRole('img', { name: 'Solid' }),
    )
    expect(texts(card)).toEqual([
      'Decision',
      'D12',
      'Show the video of the creator',
    ])
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
    render(<Card {...DECISION} type={type} />)

    expect(texts(screen.getByRole('link'))[0]).toBe(word)
  })

  it.each([
    ['solid', 'Solid'],
    ['flagged', 'Flagged'],
    ['not-ready', 'Not ready'],
    ['wrong', 'Wrong'],
  ] as const)('names the Trust %s on its one sign', (trust, word) => {
    render(<Card {...DECISION} trust={trust} />)

    const signs = screen.getAllByRole('img')

    expect(signs).toHaveLength(1)
    expect(signs[0].getAttribute('aria-label')).toBe(word)
    expect(signs[0].querySelector('title')?.textContent).toBe(word)
  })

  it('shows the Evidence level of an Insight in the type line', () => {
    render(
      <Card
        {...DECISION}
        type="insight"
        recordId="I3"
        evidenceLevel="pattern"
      />,
    )

    expect(texts(screen.getByRole('link')).slice(0, 3)).toEqual([
      'Insight',
      'I3',
      'Pattern',
    ])
  })

  it('shows the summary, the empty slots, the Work state and the owner after the title', () => {
    render(
      <Card
        {...DECISION}
        summary="A baker sees the hands of the creator."
        emptySlots={['insight', 'metric']}
        workState="to-check"
        owner="Mara"
      />,
    )

    expect(texts(screen.getByRole('link')).slice(3)).toEqual([
      'A baker sees the hands of the creator.',
      'Insight',
      'Metric',
      'To check',
      'Mara',
    ])
  })

  it('leaves out a slot that has no content', () => {
    render(<Card {...DECISION} workState="draft" />)

    const card = screen.getByRole('link')

    expect(texts(card)).toEqual([
      'Decision',
      'D12',
      'Show the video of the creator',
      'Draft',
    ])
    expect(card.querySelectorAll(':empty:not(path, title)')).toHaveLength(0)
  })

  it('is one click target that opens the record, on a light surface', async () => {
    const onOpen = vi.fn()
    render(<Card {...DECISION} workState="published" onOpen={onOpen} />)

    const card = screen.getByRole('link')

    expect(card.getAttribute('href')).toBe('#D12')
    expect(layer(card)).toBe(LAYER_01)
    expect(screen.queryByRole('button')).toBeNull()

    await userEvent.click(within(card).getByText('Published'))

    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('marks the focused card with the 2px focus', () => {
    render(<Card {...DECISION} />)

    expect(focusOutline(screen.getByRole('link'))).toBe(
      '2px solid var(--cds-focus, #0f62fe)',
    )
  })

  it('holds one action button beside the click target, not inside it', async () => {
    const onOpen = vi.fn()
    const onClick = vi.fn()
    render(
      <Card
        {...DECISION}
        onOpen={onOpen}
        action={{ label: 'Pick up', onClick }}
      />,
    )

    const card = screen.getByRole('link')
    const button = screen.getByRole('button', { name: 'Pick up' })

    expect(card.contains(button)).toBe(false)
    expect(card.querySelector('a, button, [tabindex]')).toBeNull()

    await userEvent.click(button)

    expect(onClick).toHaveBeenCalledOnce()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('gives the focus to the card first, then to the button', async () => {
    render(
      <Card {...DECISION} action={{ label: 'Pick up', onClick: () => {} }} />,
    )

    await userEvent.tab()

    expect(document.activeElement).toBe(screen.getByRole('link'))

    await userEvent.tab()

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Pick up' }),
    )
  })

  it('shows only the sign, the type line and the title as the minimal card', () => {
    render(
      <Card
        {...DECISION}
        minimal
        summary="A baker sees the hands of the creator."
        emptySlots={['metric']}
        workState="review"
        owner="Mara"
        action={{ label: 'Pick up', onClick: () => {} }}
      />,
    )

    const card = screen.getByRole('link')

    expect(within(card).getByRole('img', { name: 'Solid' })).toBeDefined()
    expect(texts(card)).toEqual([
      'Decision',
      'D12',
      'Show the video of the creator',
    ])
    expect(screen.queryByRole('button')).toBeNull()
  })
})
