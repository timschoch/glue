// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { Frame } from './frame.tsx'

// The g10 values of the two layers, from Carbon's theme table.
const BACKGROUND = '#f4f4f4'
const LAYER_01 = '#ffffff'

// The g10 value of the border that separates on the first layer.
const BORDER_SUBTLE_01 = '#e0e0e0'

// The weight of `$body-compact-01`, the type of a Concept in the left panel.
const BODY_WEIGHT = 'var(--cds-body-compact-01-font-weight, 400)'

// Carbon's lg breakpoint is 66rem: the main window keeps 30rem beside the
// left panel and the pinned column.
const FROM_LG = '(min-width: 66rem)'
const BELOW_LG = '(max-width: 65.98rem)'

const TOKEN = /^var\((--[\w-]+)/

// The pinned records, newest first.
const PINNED = ['Videos are too long', 'Show each technique']

// jsdom has no matchMedia, Carbon's side nav asks it for the breakpoint.
window.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})

// jsdom has no layout, Carbon's dropdown scrolls to the highlighted item.
Element.prototype.scrollIntoView = () => {}

afterEach(cleanup)

function renderFrame(
  pinned: ReadonlyArray<string> = [],
  onProjectChange: (project: string) => void = () => {},
) {
  render(
    <Frame
      project="Bakeday"
      projects={['Bakeday', 'Flexibeck']}
      onProjectChange={onProjectChange}
      section="Decide"
      concepts={[
        {
          name: 'Technique videos',
          concepts: ['Step videos', 'Creator videos'],
        },
        { name: 'First bake' },
      ]}
      conceptPath={['Technique videos', 'Step videos']}
      trail={['Show each technique', 'Videos are too long']}
      pinned={pinned}
    >
      Content
    </Frame>,
  )
}

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

// A style value at an element. jsdom keeps `var()` as written, so this
// follows the tokens to the value.
function resolved(element: HTMLElement, style: string): string {
  let value = style
  for (
    let token = TOKEN.exec(value);
    token !== null;
    token = TOKEN.exec(value)
  ) {
    value = tokenValue(element, token[1])
  }
  return value
}

// The media conditions under which the element, or a thing around it, is
// not shown. jsdom does not apply media rules itself.
function hiddenAt(element: HTMLElement): Array<string> {
  return [...document.styleSheets]
    .flatMap((sheet) => [...sheet.cssRules])
    .filter((rule) => rule instanceof CSSMediaRule)
    .filter((media) =>
      [...media.cssRules].some(
        (rule) =>
          rule instanceof CSSStyleRule &&
          rule.style.display === 'none' &&
          element.closest(rule.selectorText) !== null,
      ),
    )
    .map((media) => media.conditionText)
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

// The background colour of an element.
function layer(element: HTMLElement): string {
  return resolved(element, getComputedStyle(element).backgroundColor)
}

describe('Frame', () => {
  it('puts the content on the darker layer and the panels on the light layer', () => {
    renderFrame()

    expect(layer(screen.getByRole('main'))).toBe(BACKGROUND)
    expect(layer(screen.getByRole('navigation', { name: 'Main' }))).toBe(
      LAYER_01,
    )
    expect(layer(screen.getByRole('banner'))).toBe(LAYER_01)
  })

  it('shows the trail of the opened records in the main window', () => {
    renderFrame()

    const trail = within(screen.getByRole('main')).getByRole('navigation', {
      name: 'Trail',
    })

    expect(
      within(trail)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Show each technique', 'Videos are too long'])
  })

  it('joins the trail with an arrow and ends it with plain text', () => {
    renderFrame()

    const trail = screen.getByRole('navigation', { name: 'Trail' })

    expect(
      within(trail)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Show each technique'])
    expect(trail.querySelectorAll('svg')).toHaveLength(1)
    expect(trail.querySelector('[class*="breadcrumb"]')).toBeNull()
  })

  it('has no right column while no record is pinned', () => {
    renderFrame()

    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('stacks the pinned records in the right column, on the same layer as the content', () => {
    renderFrame(PINNED)

    const column = screen.getByRole('complementary', { name: 'Pinned' })

    expect(
      within(column)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Videos are too long', 'Show each technique'])
    expect(layer(column)).toBe(BACKGROUND)
  })

  it('shows each pinned record as a light card with the pinned sign', () => {
    renderFrame(PINNED)

    const cards = within(
      screen.getByRole('complementary', { name: 'Pinned' }),
    ).getAllByRole('link')

    expect(cards.map(layer)).toEqual([LAYER_01, LAYER_01])
    expect(
      cards.map((card) => within(card).getAllByRole('img', { name: 'Pinned' })),
    ).toHaveLength(PINNED.length)
  })

  it('marks the focused pinned card with the 2px focus', () => {
    renderFrame(PINNED)

    const [card] = within(
      screen.getByRole('complementary', { name: 'Pinned' }),
    ).getAllByRole('link')

    expect(focusOutline(card)).toBe('2px solid var(--cds-focus, #0f62fe)')
  })

  it('gives the current Concept the weight of the other Concepts', () => {
    renderFrame()

    const panel = within(screen.getByRole('navigation', { name: 'Main' }))

    expect(getComputedStyle(panel.getByText('Step videos')).fontWeight).toBe(
      BODY_WEIGHT,
    )
  })

  it('draws the rule below the header with the border of its layer', () => {
    renderFrame()

    const header = screen.getByRole('banner')

    expect(resolved(header, 'var(--cds-border-subtle)')).toBe(BORDER_SUBTLE_01)
  })

  it('shows the count of pins in the trail row and opens the stack from it', async () => {
    renderFrame(PINNED)

    const main = screen.getByRole('main')
    const trail = within(main).getByRole('navigation', { name: 'Trail' })
    const count = within(main).getByRole('button', { name: '2 pinned' })
    // jsdom does not show or hide the stack: Carbon's popover does it in CSS.
    const stack = within(main)
      .getAllByRole('link', { name: /^Pinned/, hidden: true })
      .map((card) => card.textContent)

    expect(trail.parentElement?.contains(count)).toBe(true)
    expect(count.textContent).toBe('2')
    expect(stack).toEqual(PINNED)
    expect(count.getAttribute('aria-expanded')).toBe('false')

    await userEvent.click(count)

    expect(count.getAttribute('aria-expanded')).toBe('true')

    await userEvent.keyboard('{Escape}')

    expect(count.getAttribute('aria-expanded')).toBe('false')
  })

  it('shows the column from the lg breakpoint, and the count of pins below it', () => {
    renderFrame(PINNED)

    const column = screen.getByRole('complementary', { name: 'Pinned' })
    const count = screen.getByRole('button', { name: '2 pinned' })

    expect(hiddenAt(column)).toEqual([BELOW_LG])
    expect(hiddenAt(count)).toEqual([FROM_LG])
  })

  it('lists the seven sections in loop order, then the Concepts', () => {
    renderFrame()

    const links = within(screen.getByRole('navigation', { name: 'Main' }))
      .getAllByRole('link')
      .map((link) => link.textContent)

    expect(links).toEqual([
      'Mine',
      'Understand',
      'Decide',
      'Design',
      'Build',
      'Use',
      'People',
      'Step videos',
      'Creator videos',
      'First bake',
    ])
  })

  it('marks one current section and one current Concept', () => {
    renderFrame()

    const current = within(screen.getByRole('navigation', { name: 'Main' }))
      .getAllByRole('link', { current: 'page' })
      .map((link) => link.textContent)

    expect(current).toEqual(['Decide', 'Step videos'])
  })

  it('holds only the breadcrumb of the Concept path in the header', () => {
    renderFrame()

    const header = screen.getByRole('banner')
    const breadcrumb = within(header).getByRole('navigation', {
      name: 'Breadcrumb',
    })

    expect([...header.children]).toEqual([breadcrumb])
    expect(
      within(breadcrumb)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Technique videos', 'Step videos'])
  })

  it('switches the Project with the first control of the left panel', async () => {
    const onProjectChange = vi.fn()
    renderFrame([], onProjectChange)

    const panel = screen.getByRole('navigation', { name: 'Main' })
    const switcher = within(panel).getByRole('combobox', { name: /Project/ })

    expect(panel.querySelector('a, button')).toBe(switcher)
    expect(within(switcher).getByText('Bakeday')).toBeDefined()

    await userEvent.click(switcher)
    await userEvent.click(screen.getByRole('option', { name: 'Flexibeck' }))

    expect(onProjectChange).toHaveBeenCalledWith('Flexibeck')
  })
})
