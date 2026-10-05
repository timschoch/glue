// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { ConceptView } from './concept-view.tsx'
import type { ConceptViewProps } from './concept-view.tsx'

type Concept = ConceptViewProps['concept']
type Part = Concept['parts'][number]

function part(id: string, type: Part['type'], title: string): Part {
  return {
    id,
    type,
    title,
    status: null,
    concept: 'technique-videos',
    conceptTitle: 'Technique videos',
    trust: 'solid',
  }
}

const CONCEPT: Concept = {
  slug: 'technique-videos',
  title: 'Technique videos',
  kind: null,
  concepts: [],
  parts: [
    part('I7', 'insight', 'Bakers want step videos'),
    part('G2', 'goal', 'First bake feels easy'),
    part('D12', 'decision', 'Show the video of the creator'),
    part('D13', 'decision', 'Loop the video without sound'),
    part('R4', 'guardrail', 'Only the videos of the creator'),
    part('E3', 'entity', 'Technique'),
    part('F5', 'flow', 'Watch a technique while baking'),
    part('M1', 'metric', 'Ease of the first bake'),
  ],
  linkedParts: [],
  slots: [],
}

// A Brief with an Insight and a Goal: the other five slots are empty.
const BRIEF: Concept = {
  ...CONCEPT,
  kind: 'brief',
  parts: CONCEPT.parts.slice(0, 2),
  slots: [
    { type: 'insight', filled: true },
    { type: 'goal', filled: true },
    { type: 'decision', filled: false },
    { type: 'metric', filled: false },
    { type: 'flow', filled: false },
    { type: 'entity', filled: false },
    { type: 'guardrail', filled: false },
  ],
}

// The titles of the type groups, in the order of the loop.
const LOOP_ORDER = [
  'Insights',
  'Goals',
  'Decisions',
  'Guardrails',
  'Entities',
  'Flows',
  'Metrics',
]

// A Concept with as many Insights as the count: I1, I2 and so on.
function withInsights(count: number): Concept {
  return {
    ...CONCEPT,
    parts: Array.from({ length: count }, (_, index) =>
      part(`I${index + 1}`, 'insight', `Insight ${index + 1}`),
    ),
  }
}

// The colour of a label or a state, as the style writes it.
const TEXT_SECONDARY = 'var(--cds-text-secondary, #525252)'

afterEach(cleanup)

function renderView(props: Partial<ConceptViewProps> = {}) {
  render(
    <ConceptView
      concept={CONCEPT}
      partHref={({ id }) => `#${id}`}
      conceptHref={({ slug }) => `#${slug}`}
      onAddPart={() => {}}
      {...props}
    />,
  )
}

// The titles of the type groups, in the order of the document.
function groups(): Array<string | null> {
  return screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent)
}

// The border of an element, as its last rule writes it. jsdom does not
// compute a border that holds `var()`.
function border(element: HTMLElement): string {
  return (
    [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .filter((rule) => rule instanceof CSSStyleRule)
      .map((rule) => ({
        selector: rule.selectorText,
        border: rule.style.getPropertyValue('border'),
      }))
      // Only a class selector: jsdom throws on Carbon's vendor selectors.
      .filter(
        ({ selector, border: value }) =>
          /^\.[\w-]+$/.test(selector) && value !== '',
      )
      .filter(({ selector }) => element.matches(selector))
      .at(-1)?.border ?? ''
  )
}

// The group of one Part type.
function group(name: string): HTMLElement {
  return screen.getByRole('region', { name })
}

// The record ids of the cards of a group, from their addresses.
function cardIds(name: string): Array<string | null> {
  return within(group(name))
    .queryAllByRole('link')
    .map((card) => card.getAttribute('href'))
}

// The names of the buttons of a group, in the order of the document.
function buttons(name: string): Array<string | null> {
  return within(group(name))
    .queryAllByRole('button')
    .map((button) => button.textContent)
}

describe('ConceptView', () => {
  it('shows the title of the Concept as the page title, with its Kind', () => {
    renderView({ concept: BRIEF })

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Technique videos',
    )
    screen.getByText('Brief')
  })

  it('shows no Kind for a Concept without one', () => {
    renderView()

    expect(screen.queryByText('Brief')).toBeNull()
  })

  it('groups the Parts by type in the order of the loop', () => {
    renderView()

    expect(groups()).toEqual(LOOP_ORDER)
    expect(
      within(group('Decisions'))
        .getAllByRole('link')
        .map((card) => card.getAttribute('href')),
    ).toEqual(['#D12', '#D13'])
  })

  it('leaves out a type with no Part when no Part can be added', () => {
    renderView({
      concept: { ...CONCEPT, parts: CONCEPT.parts.slice(0, 2) },
      onAddPart: undefined,
    })

    expect(groups()).toEqual(['Insights', 'Goals'])
  })

  it('shows a type with no Part as its title and its one add control', async () => {
    const onAddPart = vi.fn()
    renderView({
      concept: { ...CONCEPT, parts: CONCEPT.parts.slice(0, 2) },
      onAddPart,
    })

    expect(groups()).toEqual(LOOP_ORDER)
    expect(within(group('Flows')).queryByRole('list')).toBeNull()
    expect(buttons('Flows')).toEqual(['Add Flow'])

    await userEvent.click(screen.getByRole('button', { name: 'Add Flow' }))

    expect(onAddPart).toHaveBeenCalledExactlyOnceWith('flow')
  })

  it('has one ghost add control in each group, after the list of its cards', () => {
    renderView()

    expect(LOOP_ORDER.map(buttons)).toEqual([
      ['Add Insight'],
      ['Add Goal'],
      ['Add Decision'],
      ['Add Guardrail'],
      ['Add Entity'],
      ['Add Flow'],
      ['Add Metric'],
    ])

    const add = screen.getByRole('button', { name: 'Add Decision' })

    expect(add.className).toContain('btn--ghost')
    expect(add.className).toContain('btn--sm')
    expect(add.querySelectorAll('svg')).toHaveLength(1)
    expect(add.closest('li')).toBeNull()
    expect(
      within(group('Decisions'))
        .getByRole('list')
        .compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add Part' })).toBeNull()
  })

  it('shows all cards of a group with 6 cards, and no button to fold it', () => {
    renderView({ concept: withInsights(6) })

    expect(cardIds('Insights')).toHaveLength(6)
    expect(buttons('Insights')).toEqual(['Add Insight'])
  })

  it('folds a group with more than 6 cards to its first 6, and unfolds it with one button', async () => {
    renderView({ concept: withInsights(8) })

    const fold = screen.getByRole('button', { name: 'Show all 8' })

    expect(cardIds('Insights')).toEqual([
      '#I1',
      '#I2',
      '#I3',
      '#I4',
      '#I5',
      '#I6',
    ])
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    expect(fold.className).toContain('btn--ghost')
    expect(fold.className).toContain('btn--sm')
    expect(buttons('Insights')).toEqual(['Show all 8', 'Add Insight'])

    await userEvent.click(fold)

    expect(cardIds('Insights')).toHaveLength(8)
    expect(fold.textContent).toBe('Show 6')
    expect(fold.getAttribute('aria-expanded')).toBe('true')

    await userEvent.click(fold)

    expect(cardIds('Insights')).toHaveLength(6)
    expect(fold.textContent).toBe('Show all 8')
    expect(fold.getAttribute('aria-expanded')).toBe('false')
  })

  it('counts the linked Parts of a group too, and folds a group that can add no Part', () => {
    renderView({
      concept: {
        ...withInsights(5),
        linkedParts: [
          part('I21', 'insight', 'Novices stop at long videos'),
          part('I22', 'insight', 'Videos have no sound'),
        ],
      },
      onAddPart: undefined,
    })

    expect(cardIds('Insights')).toEqual([
      '#I1',
      '#I2',
      '#I3',
      '#I4',
      '#I5',
      '#I21',
    ])
    expect(buttons('Insights')).toEqual(['Show all 7'])
  })

  it('shows each Part as a card with its type, record id and title', () => {
    renderView()

    const card = within(group('Goals')).getByRole('link')

    within(card).getByRole('img', { name: 'Solid' })
    expect(
      [...card.querySelectorAll('span, p')]
        .filter((element) => element.children.length === 0)
        .map((element) => element.textContent),
    ).toEqual(['Goal', 'G2', 'First bake feels easy'])
  })

  it('opens a Part from its card', async () => {
    const onOpenPart = vi.fn()
    renderView({ onOpenPart })

    await userEvent.click(screen.getByText('Technique'))

    expect(onOpenPart).toHaveBeenCalledOnce()
    expect(onOpenPart.mock.calls[0][0].id).toBe('E3')
  })

  it('shows an empty slot of the Kind at the place of its type, as its one button', async () => {
    const onAddPart = vi.fn()
    renderView({ concept: BRIEF, onAddPart })

    expect(groups()).toEqual(LOOP_ORDER)

    const decisions = within(group('Decisions'))

    expect(decisions.queryByRole('link')).toBeNull()
    expect(decisions.getByRole('listitem').textContent).toBe('Add Decision')
    // The button of the empty slot is the one add control of its group.
    expect(buttons('Decisions')).toEqual(['Add Decision'])

    await userEvent.click(
      decisions.getByRole('button', { name: 'Add Decision' }),
    )

    expect(onAddPart).toHaveBeenCalledExactlyOnceWith('decision')
  })

  it('draws the empty slot with the dashed border', () => {
    renderView({ concept: BRIEF })

    const slot = within(group('Decisions')).getByRole('listitem')

    expect(border(slot)).toBe('1px dashed var(--cds-border-strong-01, #8d8d8d)')
  })

  it('shows a linked Part after the Parts of its type, with the name of its home Concept on the card', () => {
    renderView({
      concept: {
        ...CONCEPT,
        linkedParts: [
          {
            ...part('I21', 'insight', 'Novices stop at long videos'),
            concept: 'ux-study',
            conceptTitle: 'UX study',
          },
        ],
      },
    })

    const insights = within(group('Insights'))
    const [home, linked] = insights.getAllByRole('link')

    expect([home, linked].map((card) => card.getAttribute('href'))).toEqual([
      '#I7',
      '#I21',
    ])
    within(linked).getByText('UX study')
    expect(within(home).queryByText('Technique videos')).toBeNull()
    expect(
      insights.getAllByRole('listitem').map((item) => item.children.length),
    ).toEqual([1, 1])
    expect(insights.queryByRole('img', { name: 'Link' })).toBeNull()
  })

  it('counts a linked Part as the Part of its slot', () => {
    renderView({
      concept: {
        ...BRIEF,
        linkedParts: [
          {
            ...part('D7', 'decision', 'Ask the UX team'),
            concept: 'ux-study',
            conceptTitle: 'UX study',
          },
        ],
        slots: BRIEF.slots.map((slot) =>
          slot.type === 'decision' ? { ...slot, filled: true } : slot,
        ),
      },
    })

    const decisions = within(group('Decisions'))

    expect(decisions.getAllByRole('link')).toHaveLength(1)
    expect(decisions.getAllByRole('listitem')).toHaveLength(1)
    expect(
      decisions.getByRole('button', { name: 'Add Decision' }).closest('li'),
    ).toBeNull()
  })

  it('shows the Concepts inside as tiles with their count of Parts', async () => {
    const onOpenConcept = vi.fn()
    renderView({
      concept: {
        ...CONCEPT,
        concepts: [
          {
            slug: 'step-videos',
            title: 'Step videos',
            kind: 'brief',
            partCount: 12,
            concepts: [],
          },
          {
            slug: 'creator-videos',
            title: 'Creator videos',
            kind: null,
            partCount: 1,
            concepts: [],
          },
        ],
      },
      onOpenConcept,
    })

    const tiles = within(
      screen.getByRole('navigation', { name: 'Concepts' }),
    ).getAllByRole('link')

    expect(tiles.map((tile) => tile.textContent)).toEqual([
      'Step videos12 Parts',
      'Creator videos1 Part',
    ])
    expect(tiles.map((tile) => tile.getAttribute('href'))).toEqual([
      '#step-videos',
      '#creator-videos',
    ])

    await userEvent.click(tiles[0])

    expect(onOpenConcept.mock.calls[0][0].slug).toBe('step-videos')
  })

  it('has no row of Concepts when no Concept is inside', () => {
    renderView()

    expect(screen.queryByRole('navigation', { name: 'Concepts' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Concept' })).toBeNull()
  })

  it('adds a Concept with the one ghost button of the row of Concepts, also when no Concept is inside', async () => {
    const onAddConcept = vi.fn()
    renderView({ onAddConcept })

    const row = within(screen.getByRole('navigation', { name: 'Concepts' }))
    const add = row.getByRole('button', { name: 'Add Concept' })

    expect(row.queryByRole('list')).toBeNull()
    expect(row.getAllByRole('button')).toEqual([add])
    expect(add.className).toContain('btn--ghost')
    expect(add.className).toContain('btn--sm')
    expect(add.querySelectorAll('svg')).toHaveLength(1)

    await userEvent.click(add)

    expect(onAddConcept).toHaveBeenCalledOnce()
  })

  it('puts the button that adds a Concept after the tiles', () => {
    renderView({
      concept: {
        ...CONCEPT,
        concepts: [
          {
            slug: 'step-videos',
            title: 'Step videos',
            kind: null,
            partCount: 2,
            concepts: [],
          },
        ],
      },
      onAddConcept: () => {},
    })

    const row = within(screen.getByRole('navigation', { name: 'Concepts' }))

    expect(
      row
        .getByRole('list')
        .compareDocumentPosition(
          row.getByRole('button', { name: 'Add Concept' }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('shows only the Part types of a lens', () => {
    renderView({ concept: BRIEF, types: ['goal', 'decision'] })

    expect(groups()).toEqual(['Goals', 'Decisions'])
  })

  it('shows each type of an empty Concept as its title and its add control', () => {
    renderView({ concept: { ...CONCEPT, parts: [] } })

    expect(groups()).toEqual(LOOP_ORDER)
    expect(screen.queryByText('No Parts')).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(LOOP_ORDER.length)
  })

  it('shows an empty slot as its type alone, and no button, when no Part can be added', () => {
    renderView({ concept: BRIEF, onAddPart: undefined })

    const slot = within(group('Decisions')).getByRole('listitem')

    expect(slot.textContent).toBe('Decision')
    expect(border(slot)).toBe('1px dashed var(--cds-border-strong-01, #8d8d8d)')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows an empty Concept as plain words alone when no Part can be added', () => {
    renderView({ concept: { ...CONCEPT, parts: [] }, onAddPart: undefined })

    const words = screen.getByText('No Parts')

    expect(getComputedStyle(words).color).toBe(TEXT_SECONDARY)
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows no words for a lens with no Part type: no Part is missing', () => {
    renderView({ types: [] })

    expect(screen.queryByText('No Parts')).toBeNull()
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('has no switch when the view cannot change', () => {
    renderView()

    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('switches from the list to the map', async () => {
    const onViewChange = vi.fn()
    renderView({ onViewChange })

    expect(
      screen.getByRole('tab', { name: 'List' }).getAttribute('aria-selected'),
    ).toBe('true')
    await userEvent.click(screen.getByRole('tab', { name: 'Map' }))

    expect(onViewChange).toHaveBeenCalledExactlyOnceWith('map')
  })

  it('shows the Map and its panel in place of the list, with the head of the Concept', () => {
    renderView({
      view: 'map',
      onViewChange: () => {},
      map: <figure aria-label="Map" />,
      panel: <aside aria-label="Decision D12" />,
    })

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Technique videos',
    )
    expect(
      screen.getByRole('tab', { name: 'Map' }).getAttribute('aria-selected'),
    ).toBe('true')
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    expect(screen.queryByRole('listitem')).toBeNull()
    screen.getByRole('figure', { name: 'Map' })
    screen.getByRole('complementary', { name: 'Decision D12' })
  })

  it('shows no Map and no panel in the list', () => {
    renderView({
      map: <figure aria-label="Map" />,
      panel: <aside aria-label="Decision D12" />,
    })

    expect(screen.queryByRole('figure')).toBeNull()
    expect(screen.queryByRole('complementary')).toBeNull()
  })
})
