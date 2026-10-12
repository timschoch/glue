// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import './theme.scss'
import { Frame, PlainFrame } from './frame.tsx'
import type { FramePin, FrameProps, FrameStep } from './frame.tsx'

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

// Below Carbon's md breakpoint the header has room for one Concept.
const BELOW_MD = '(max-width: 41.98rem)'

// The width of Carbon's side nav.
const PANEL_WIDTH = '16rem'

const TOKEN = /^var\((--[\w-]+)/

// The pinned records, newest first.
const PINNED: ReadonlyArray<FramePin> = [
  {
    type: 'insight',
    recordId: 'I7',
    title: 'Videos are too long',
    trust: 'flagged',
    href: '/bakeday/technique-videos/I7',
  },
  {
    type: 'decision',
    recordId: 'D12',
    title: 'Show each technique',
    trust: 'solid',
    href: '/bakeday/technique-videos/D12',
  },
]

// The loop steps of the open Concept: three have Parts, two have none.
const STEPS: ReadonlyArray<FrameStep> = [
  {
    name: 'Understand',
    href: '/bakeday/step-videos?section=Understand',
    hasParts: true,
  },
  { name: 'Decide', href: '/bakeday/step-videos', hasParts: true },
  {
    name: 'Design',
    href: '/bakeday/step-videos?section=Design',
    hasParts: false,
  },
  {
    name: 'Build',
    href: '/bakeday/step-videos?section=Build',
    hasParts: false,
  },
  { name: 'Use', href: '/bakeday/step-videos?section=Use', hasParts: true },
]

// The texts of the two pinned cards, in the order of the document.
const PINNED_TEXTS = [
  ['Insight', 'I7', 'Videos are too long'],
  ['Decision', 'D12', 'Show each technique'],
]

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
  pinned: ReadonlyArray<FramePin> = [],
  onProjectChange: (project: string) => void = () => {},
  onUnpin: (recordId: string) => void = () => {},
  props: Partial<FrameProps> = {},
) {
  render(
    <Frame
      project="Bakeday"
      projects={['Bakeday', 'Flexibeck']}
      onProjectChange={onProjectChange}
      section="Decide"
      mineHref="/bakeday?section=Mine"
      peopleHref="/bakeday?section=People"
      rootHref="/bakeday"
      steps={STEPS}
      concepts={[
        {
          name: 'Technique videos',
          href: '/bakeday/technique-videos',
          concepts: [
            { name: 'Step videos', href: '/bakeday/step-videos' },
            { name: 'Creator videos', href: '/bakeday/creator-videos' },
          ],
        },
        { name: 'First bake', href: '/bakeday/first-bake' },
      ]}
      conceptPath={[
        { name: 'Technique videos', href: '/bakeday/technique-videos' },
        { name: 'Step videos', href: '/bakeday/step-videos' },
      ]}
      trail={[
        { name: 'Show each technique', href: '/bakeday/step-videos/D12' },
        { name: 'Videos are too long', href: '/bakeday/step-videos/I7' },
      ]}
      pinned={pinned}
      onUnpin={onUnpin}
      {...props}
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

// The value that the media rules give a property of an element, by media
// condition. jsdom does not apply media rules itself.
function styleAt(
  element: HTMLElement,
  property: string,
): Record<string, string> {
  return Object.fromEntries(
    [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .filter((rule) => rule instanceof CSSMediaRule)
      .flatMap((media) =>
        [...media.cssRules]
          .filter((rule) => rule instanceof CSSStyleRule)
          .filter((rule) => element.matches(rule.selectorText))
          .map((rule) => rule.style.getPropertyValue(property))
          .filter((value) => value !== '')
          .map((value) => [media.conditionText, value]),
      ),
  )
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

// The overlay Carbon lays over the main window while the left panel is open.
// It has no role and no name.
function overlay(): Element {
  const found = document.querySelector('[class*="side-nav__overlay"]')
  if (!found) throw new Error('The left panel has no overlay')
  return found
}

// The cards of the stack that opens over the main window. jsdom does not
// show or hide the stack: Carbon's popover does it in CSS.
function stackCards(): Array<HTMLElement> {
  return within(screen.getByRole('main'))
    .getAllByRole('link', { hidden: true })
    .filter((link) => link.closest('[class*="popover-content"]') !== null)
}

// The tooltip that names an icon button. Testing Library does not read the
// name from a closed tooltip, a browser does.
function tooltip(button: HTMLElement): string | undefined {
  const id = button.getAttribute('aria-labelledby')
  return screen
    .getAllByRole('tooltip', { hidden: true })
    .find((candidate) => candidate.id === id)?.textContent
}

// The texts of a card, in the order of the document.
function texts(card: HTMLElement): Array<string> {
  return [...card.querySelectorAll('span, p')]
    .filter((element) => element.children.length === 0)
    .map((element) => element.textContent)
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

  it('shows no trail for one record: the record has its title already', () => {
    renderFrame([], undefined, undefined, {
      trail: [{ name: 'Videos are too long', href: '/bakeday/step-videos/I7' }],
    })

    expect(screen.queryByRole('navigation', { name: 'Trail' })).toBeNull()
  })

  it('keeps the count of pins in the row of a trail with one record', () => {
    renderFrame(PINNED, undefined, undefined, {
      trail: [{ name: 'Videos are too long', href: '/bakeday/step-videos/I7' }],
    })

    const main = within(screen.getByRole('main'))

    expect(main.queryByRole('navigation', { name: 'Trail' })).toBeNull()
    main.getByRole('button', { name: '2 pinned' })
  })

  it('shows the last Concept of the breadcrumb alone below md, on one line with an ellipsis', () => {
    renderFrame()

    const [first, last] = within(
      screen.getByRole('navigation', { name: 'Breadcrumb' }),
    ).getAllByRole('listitem')

    expect(hiddenAt(first)).toEqual([BELOW_MD])
    expect(hiddenAt(last)).toEqual([])
    const link = within(last).getByRole('link')

    expect(styleAt(link, 'text-overflow')).toEqual({ [BELOW_MD]: 'ellipsis' })
    expect(styleAt(link, 'white-space')).toEqual({ [BELOW_MD]: 'nowrap' })
  })

  it('has no right column while no record is pinned', () => {
    renderFrame()

    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('stacks the pinned records in the right column, on the same layer as the content', () => {
    renderFrame(PINNED)

    const column = screen.getByRole('complementary', { name: 'Pinned' })

    expect(within(column).getAllByRole('link').map(texts)).toEqual(PINNED_TEXTS)
    expect(layer(column)).toBe(BACKGROUND)
  })

  it('shows each pinned record as a light minimal card with its Trust sign', () => {
    renderFrame(PINNED)

    const cards = within(
      screen.getByRole('complementary', { name: 'Pinned' }),
    ).getAllByRole('link')

    expect(cards.map(layer)).toEqual([LAYER_01, LAYER_01])
    expect(
      cards.map((card) =>
        within(card).getByRole('img').getAttribute('aria-label'),
      ),
    ).toEqual(['Flagged', 'Solid'])
  })

  it('removes a pin with the one button of its card', async () => {
    const onUnpin = vi.fn()
    renderFrame(PINNED, undefined, onUnpin)

    const column = within(screen.getByRole('complementary', { name: 'Pinned' }))
    const buttons = column.getAllByRole('button')

    expect(
      buttons.map((button) => button.querySelectorAll('svg').length),
    ).toEqual([1, 1])
    expect(buttons.map(tooltip)).toEqual(['Unpin', 'Unpin'])
    expect(
      column.getAllByRole('link').some((card) => card.querySelector('button')),
    ).toBe(false)

    await userEvent.click(buttons[1])

    expect(onUnpin).toHaveBeenCalledExactlyOnceWith('D12')
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
    const stack = stackCards().map(texts)

    expect(trail.parentElement?.contains(count)).toBe(true)
    expect(count.textContent).toBe('2')
    expect(stack).toEqual(PINNED_TEXTS)
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

  it('lists the Project itself and its Concepts in the left panel', () => {
    renderFrame()

    const links = within(screen.getByRole('navigation', { name: 'Main' }))
      .getAllByRole('link')
      .map((link) => link.textContent)

    expect(links).toEqual([
      'Concept',
      'Step videos',
      'Creator videos',
      'First bake',
    ])
  })

  it('marks the open Concept alone in the left panel while a loop step is open', () => {
    renderFrame()

    const current = within(screen.getByRole('navigation', { name: 'Main' }))
      .getAllByRole('link', { current: 'page' })
      .map((link) => link.textContent)

    expect(current).toEqual(['Step videos'])
  })

  it.each(['Mine', 'People'] as const)(
    'marks %s alone while it is open: no Concept and no loop step',
    (section) => {
      renderFrame([], undefined, undefined, { section })

      const current = (name: string) =>
        [
          ...screen
            .getByRole('navigation', { name })
            .querySelectorAll('[aria-current]'),
        ].map((link) => link.textContent)

      expect(current('Sections')).toEqual([section])
      expect(current('Main')).toEqual([])
    },
  )

  it('lists Mine, the loop steps and People on one line above the content', () => {
    renderFrame()

    const main = screen.getByRole('main')
    const sections = within(main).getByRole('navigation', { name: 'Sections' })

    expect(main.firstElementChild).toBe(sections)
    expect(
      within(sections)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      'Mine',
      'Understand',
      'Decide',
      'Design',
      'Build',
      'Use',
      'People',
    ])
  })

  it('draws Mine and People with no box: they are no step of the loop', () => {
    renderFrame()

    const sections = within(
      screen.getByRole('navigation', { name: 'Sections' }),
    )
    const loop = screen.getByRole('list', { name: 'Loop' })

    for (const name of ['Mine', 'People']) {
      const link = sections.getByRole('link', { name })
      expect(loop.contains(link)).toBe(false)
      expect(['', 'none']).toContain(getComputedStyle(link).borderTopStyle)
    }
  })

  it('lists the five loop steps in loop order', () => {
    renderFrame()

    const loop = screen.getByRole('list', { name: 'Loop' })

    expect(
      within(loop)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Understand', 'Decide', 'Design', 'Build', 'Use'])
  })

  it('marks the one current loop step', () => {
    renderFrame()

    const loop = within(screen.getByRole('list', { name: 'Loop' }))

    expect(
      loop
        .getAllByRole('link', { current: 'step' })
        .map((link) => link.textContent),
    ).toEqual(['Decide'])
  })

  it('draws a loop step that has Parts with a solid border and one with no Parts with a dashed border', () => {
    renderFrame()

    const loop = within(screen.getByRole('list', { name: 'Loop' }))

    expect(
      loop
        .getAllByRole('link')
        .map((link) => getComputedStyle(link).borderTopStyle),
    ).toEqual(['solid', 'solid', 'dashed', 'dashed', 'solid'])
  })

  it('ends the loop steps with one arrow', () => {
    renderFrame()

    const loop = screen.getByRole('list', { name: 'Loop' })

    expect(loop.querySelectorAll('svg')).toHaveLength(1)
    expect(
      within(loop).getAllByRole('listitem').at(-1)?.querySelector('svg'),
    ).not.toBeNull()
  })

  it('holds the menu button, the breadcrumb of the Concept path and the left panel in the header', () => {
    renderFrame()

    const header = screen.getByRole('banner')
    const breadcrumb = within(header).getByRole('navigation', {
      name: 'Breadcrumb',
    })

    expect([...header.children]).toEqual([
      within(header).getByRole('button', { name: 'Menu' }),
      breadcrumb,
      overlay(),
      within(header).getByRole('navigation', { name: 'Main' }),
    ])
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
    within(switcher).getByText('Bakeday')

    await userEvent.click(switcher)
    await userEvent.click(screen.getByRole('option', { name: 'Flexibeck' }))

    expect(onProjectChange).toHaveBeenCalledWith('Flexibeck')
  })

  it('has no button to add a Concept and none to sign out without their callbacks', () => {
    renderFrame()

    const panel = within(screen.getByRole('navigation', { name: 'Main' }))

    expect(panel.queryByRole('button', { name: 'Add Concept' })).toBeNull()
    expect(panel.queryByRole('button', { name: 'Sign out' })).toBeNull()
    expect(panel.queryAllByRole('separator', { hidden: true })).toEqual([])
  })

  it('lists the Projects alone in the switcher without the callback that adds one', async () => {
    renderFrame()

    await userEvent.click(screen.getByRole('combobox', { name: /Project/ }))

    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['Bakeday', 'Flexibeck'])
  })

  it('adds a Project with the last item of the switcher, keeps the Project and closes the left panel', async () => {
    const onAddProject = vi.fn()
    const onProjectChange = vi.fn()
    renderFrame([], onProjectChange, undefined, { onAddProject })

    const menu = screen.getByRole('button', { name: 'Menu' })
    const panel = screen.getByRole('navigation', { name: 'Main' })
    const switcher = within(panel).getByRole('combobox', { name: /Project/ })
    await userEvent.click(menu)

    // No button beside the switcher: the first link comes next.
    expect(
      [...panel.querySelectorAll('a, button')].map(
        ({ textContent }) => textContent,
      )[1],
    ).toBe('Concept')

    await userEvent.click(switcher)
    const options = screen.getAllByRole('option')

    expect(options.map((option) => option.textContent)).toEqual([
      'Bakeday',
      'Flexibeck',
      'Add Project',
    ])

    await userEvent.click(options[2])

    expect(onAddProject).toHaveBeenCalledOnce()
    expect(onProjectChange).not.toHaveBeenCalled()
    within(switcher).getByText('Bakeday')
    expect(menu.getAttribute('aria-expanded')).toBe('false')
  })

  it('adds a Concept with the one ghost button after the Concepts, and closes the left panel', async () => {
    const onAddConcept = vi.fn()
    renderFrame([], undefined, undefined, {
      onAddConcept,
      onSignOut: () => {},
    })

    const menu = screen.getByRole('button', { name: 'Menu' })
    const panel = screen.getByRole('navigation', { name: 'Main' })
    await userEvent.click(menu)
    const add = within(panel).getByRole('button', { name: 'Add Concept' })

    // The last controls of the panel: the last Concept, the button, Sign out.
    expect(
      [...panel.querySelectorAll('a, button')]
        .slice(-3)
        .map(({ textContent }) => textContent),
    ).toEqual(['First bake', 'Add Concept', 'Sign out'])
    expect(add.closest('ul')).toBe(
      within(panel).getByRole('link', { name: 'First bake' }).closest('ul'),
    )
    expect(add.querySelectorAll('svg')).toHaveLength(1)

    await userEvent.click(add)

    expect(onAddConcept).toHaveBeenCalledOnce()
    expect(menu.getAttribute('aria-expanded')).toBe('false')
  })

  it('signs out with the one ghost button at the end of the left panel, after a divider', async () => {
    const onSignOut = vi.fn()
    renderFrame([], undefined, undefined, { onSignOut })

    const panel = screen.getByRole('navigation', { name: 'Main' })
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
    // The one button of this name is in the panel, not in the header row.
    const signOut = screen.getByRole('button', { name: 'Sign out' })

    expect([...panel.querySelectorAll('a, button')].at(-1)).toBe(signOut)
    expect(signOut.className).toContain('btn--ghost')
    expect(signOut.closest('li')?.previousElementSibling?.className).toContain(
      'side-nav__divider',
    )

    await userEvent.click(signOut)

    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it.each(['Sign out'])(
    'reaches the button %s with the keyboard in the open left panel',
    async (name) => {
      const onPress = vi.fn()
      renderFrame([], undefined, undefined, { onSignOut: onPress })

      await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
      const button = screen.getByRole('button', { name })

      // Tab goes through the breadcrumb and the panel, in document order.
      while (document.activeElement !== button) {
        const before = document.activeElement
        await userEvent.tab()
        if (document.activeElement === before) break
        if (document.activeElement === document.body) break
      }

      expect(document.activeElement).toBe(button)

      await userEvent.keyboard('{Enter}')

      expect(onPress).toHaveBeenCalledOnce()
    },
  )

  it('puts the menu button at the left of the header, below the lg breakpoint only', () => {
    renderFrame()

    const header = screen.getByRole('banner')
    const menu = within(header).getByRole('button', { name: 'Menu' })

    expect(header.firstElementChild).toBe(menu)
    // Carbon hides the button in two rules of the same breakpoint.
    expect(new Set(hiddenAt(menu))).toEqual(new Set([FROM_LG]))
  })

  it('gives the main window the full width below lg, and the room beside the left panel from lg', () => {
    renderFrame()

    const main = screen.getByRole('main')

    expect(getComputedStyle(main).marginInlineStart).toBe('0')
    expect(styleAt(main, 'margin-inline-start')).toEqual({
      [FROM_LG]: PANEL_WIDTH,
    })
  })

  it('keeps the left panel at the full height of the window while a long page scrolls', () => {
    renderFrame()

    expect(
      getComputedStyle(screen.getByRole('navigation', { name: 'Main' }))
        .position,
    ).toBe('fixed')
  })

  it('shows the pinned card as a light card on the canvas in the stack too', () => {
    renderFrame(PINNED)

    const cards = stackCards()
    const stack = cards[0].closest<HTMLElement>('[class*="popover-content"]')

    expect(cards.map(layer)).toEqual([LAYER_01, LAYER_01])
    expect(stack && layer(stack)).toBe(BACKGROUND)
  })

  it('keeps the left panel closed below lg and opens it from the menu button', async () => {
    renderFrame()

    const menu = screen.getByRole('button', { name: 'Menu' })
    const panel = screen.getByRole('navigation', { name: 'Main' })

    expect(menu.getAttribute('aria-expanded')).toBe('false')
    expect(panel.hasAttribute('inert')).toBe(true)

    await userEvent.click(menu)

    expect(menu.getAttribute('aria-expanded')).toBe('true')
    expect(panel.hasAttribute('inert')).toBe(false)
  })

  it('gives the focus back to the menu button when Escape closes the left panel', async () => {
    renderFrame()

    const menu = screen.getByRole('button', { name: 'Menu' })
    await userEvent.click(menu)
    screen.getByRole('link', { name: 'First bake' }).focus()
    await userEvent.keyboard('{Escape}')

    expect(document.activeElement).toBe(menu)
  })

  it.each([
    ['Escape', () => userEvent.keyboard('{Escape}')],
    [
      'Escape in the Project switcher',
      () => {
        screen.getByRole('combobox', { name: /Project/ }).focus()
        return userEvent.keyboard('{Escape}')
      },
    ],
    ['a click outside', () => userEvent.click(overlay())],
    [
      'a choice in the panel',
      () => userEvent.click(screen.getByRole('link', { name: 'First bake' })),
    ],
  ])('closes the open left panel on %s', async (_name, close) => {
    // Escape in the Project switcher starts a timer of 3 s in Carbon. The
    // test runs it, so it does not end after the test file.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    onTestFinished(() => {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    })
    renderFrame()

    const menu = screen.getByRole('button', { name: 'Menu' })
    await userEvent.click(menu)
    await close()

    expect(menu.getAttribute('aria-expanded')).toBe('false')
    expect(
      screen.getByRole('navigation', { name: 'Main' }).hasAttribute('inert'),
    ).toBe(true)
  })

  it('gives each link the address of its place', () => {
    renderFrame(PINNED)

    const address = (name: string, within_: HTMLElement) =>
      within(within_).getByRole('link', { name }).getAttribute('href')
    const panel = screen.getByRole('navigation', { name: 'Main' })
    const sections = screen.getByRole('navigation', { name: 'Sections' })

    expect(address('Mine', sections)).toBe('/bakeday?section=Mine')
    expect(address('People', sections)).toBe('/bakeday?section=People')
    expect(address('Concept', panel)).toBe('/bakeday')
    expect(address('Design', screen.getByRole('list', { name: 'Loop' }))).toBe(
      '/bakeday/step-videos?section=Design',
    )
    expect(address('Step videos', panel)).toBe('/bakeday/step-videos')
    expect(address('First bake', panel)).toBe('/bakeday/first-bake')
    expect(
      address(
        'Technique videos',
        screen.getByRole('navigation', { name: 'Breadcrumb' }),
      ),
    ).toBe('/bakeday/technique-videos')
    expect(
      address(
        'Show each technique',
        screen.getByRole('navigation', { name: 'Trail' }),
      ),
    ).toBe('/bakeday/step-videos/D12')
    expect(
      within(screen.getByRole('complementary', { name: 'Pinned' }))
        .getAllByRole('link')
        .map((card) => card.getAttribute('href')),
    ).toEqual(['/bakeday/technique-videos/I7', '/bakeday/technique-videos/D12'])
  })

  it.each([
    ['People', 'Sections', 'People', '/bakeday?section=People'],
    ['the Project itself', 'Main', 'Concept', '/bakeday'],
    [
      'a loop step',
      'Sections',
      'Design',
      '/bakeday/step-videos?section=Design',
    ],
    ['a Concept', 'Main', 'First bake', '/bakeday/first-bake'],
    [
      'a Concept inside a Concept',
      'Main',
      'Creator videos',
      '/bakeday/creator-videos',
    ],
    [
      'a Concept of the path',
      'Breadcrumb',
      'Technique videos',
      '/bakeday/technique-videos',
    ],
    [
      'a record of the trail',
      'Trail',
      'Show each technique',
      '/bakeday/step-videos/D12',
    ],
  ])('opens %s with a click on its link', async (_name, place, name, href) => {
    const onOpen = vi.fn()
    renderFrame([], undefined, undefined, { onOpen })

    await userEvent.click(
      within(screen.getByRole('navigation', { name: place })).getByRole(
        'link',
        { name },
      ),
    )

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(href, expect.anything())
  })

  it('opens a pinned record with a click on its card', async () => {
    const onOpen = vi.fn()
    renderFrame(PINNED, undefined, undefined, { onOpen })

    const [card] = within(
      screen.getByRole('complementary', { name: 'Pinned' }),
    ).getAllByRole('link')
    await userEvent.click(card)

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(
      '/bakeday/technique-videos/I7',
      expect.anything(),
    )
  })

  it('marks no loop step while none is chosen', () => {
    renderFrame([], undefined, undefined, { section: undefined })

    expect(
      within(screen.getByRole('list', { name: 'Loop' })).queryAllByRole(
        'link',
        { current: 'step' },
      ),
    ).toEqual([])
  })

  it('shows the count of the new flags as a plain number beside Mine', () => {
    renderFrame([], undefined, undefined, { newFlagCount: 3 })

    const sections = within(
      screen.getByRole('navigation', { name: 'Sections' }),
    )

    sections.getByRole('link', { name: 'Mine 3' })
    sections.getByRole('link', { name: 'People' })
  })

  it('shows no count beside Mine at zero', () => {
    renderFrame([], undefined, undefined, { newFlagCount: 0 })

    within(screen.getByRole('navigation', { name: 'Sections' })).getByRole(
      'link',
      { name: 'Mine' },
    )
  })

  it.each([
    [
      'the Concept of the path that the panel shows, under a root Concept and over a deeper one',
      [
        { name: 'Bakeday', href: '/bakeday' },
        { name: 'Technique videos', href: '/bakeday/technique-videos' },
        { name: 'Step videos', href: '/bakeday/step-videos' },
        { name: 'Kneading', href: '/bakeday/kneading' },
      ],
      ['Step videos'],
    ],
    [
      'the Project itself while the path has no Concept of the panel',
      [{ name: 'Bakeday', href: '/bakeday' }],
      ['Concept'],
    ],
    [
      'no link while the open Concept is the title of a menu of the panel',
      [
        { name: 'Bakeday', href: '/bakeday' },
        { name: 'Technique videos', href: '/bakeday/technique-videos' },
      ],
      [],
    ],
  ])('marks %s', (_name, conceptPath, marked) => {
    renderFrame([], undefined, undefined, {
      section: undefined,
      conceptPath,
    })

    expect(
      within(screen.getByRole('navigation', { name: 'Main' }))
        .queryAllByRole('link', { current: 'page' })
        .map((link) => link.textContent),
    ).toEqual(marked)
  })
})

describe('PlainFrame', () => {
  it('puts a page without the panels on the canvas, in the main landmark', () => {
    render(<PlainFrame>Content</PlainFrame>)

    const main = screen.getByRole('main')

    expect(main.textContent).toBe('Content')
    expect(layer(main)).toBe(BACKGROUND)
    expect(styleAt(main, 'margin-inline-start')).toEqual({})
  })
})
