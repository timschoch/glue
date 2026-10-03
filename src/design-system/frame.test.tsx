// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import './theme.scss'
import { Frame } from './frame.tsx'

// The g10 values of the two layers, from Carbon's theme table.
const BACKGROUND = '#f4f4f4'
const LAYER_01 = '#ffffff'

const TOKEN = /^var\((--[\w-]+)/

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

afterEach(cleanup)

function renderFrame(pinned: ReadonlyArray<ReactElement> = []) {
  render(
    <Frame
      project="Bakeday"
      section="Decide"
      concepts={[
        { name: 'Technique videos', concepts: ['Step videos'] },
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

  it('has no right column while no record is pinned', () => {
    renderFrame()

    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('stacks the pinned records in the right column, on the same layer as the content', () => {
    renderFrame([
      <a key="newest" href="#">
        Videos are too long
      </a>,
      <a key="oldest" href="#">
        Show each technique
      </a>,
    ])

    const column = screen.getByRole('complementary', { name: 'Pinned' })

    expect(
      within(column)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Videos are too long', 'Show each technique'])
    expect(layer(column)).toBe(BACKGROUND)
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
    ).toEqual(['Bakeday', 'Technique videos', 'Step videos'])
  })
})
