// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type * as reactFlow from '@xyflow/react'
import { useState } from 'react'
import type { SyntheticEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MapConcept, MapJoint, MapPart } from './concept-map-layout.ts'
import styles from './concept-map.module.scss'
import { ConceptMap } from './concept-map.tsx'
import type { ConceptMapProps } from './concept-map.tsx'

// Each fit that a Map asks of React Flow, with its options. jsdom has no
// layout: no test reads a place.
const fitView = vi.hoisted(() => vi.fn())
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof reactFlow>()
  const ReactFlow: typeof actual.ReactFlow = (props) => (
    <actual.ReactFlow
      {...props}
      onInit={(instance) => {
        const fit = instance.fitView
        instance.fitView = (options) => {
          fitView(options)
          return fit(options)
        }
        props.onInit?.(instance)
      }}
    />
  )
  return { ...actual, ReactFlow }
})

// React Flow watches the size of its nodes, which jsdom can not do.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

const TREE: MapConcept = {
  slug: 'glue',
  title: 'Glue',
  concepts: [
    { slug: 'part-model', title: 'Part model', concepts: [] },
    {
      slug: 'build-run',
      title: 'Build run',
      concepts: [
        { slug: 'merge-gate', title: 'Merge gate', concepts: [] },
        { slug: 'verify', title: 'Verify', concepts: [] },
      ],
    },
    { slug: 'people', title: 'People', concepts: [] },
  ],
}

const G1: MapPart = {
  id: 'G1',
  type: 'goal',
  title: 'Glue is the hub',
  trust: 'solid',
  concept: 'glue',
}
const D1: MapPart = {
  id: 'D1',
  type: 'decision',
  title: 'Parts glue to Parts',
  trust: 'solid',
  concept: 'part-model',
}
const E1: MapPart = {
  id: 'E1',
  type: 'entity',
  title: 'Part',
  trust: 'flagged',
  concept: 'part-model',
}
const D2: MapPart = {
  id: 'D2',
  type: 'decision',
  title: 'Gate each merge',
  trust: 'solid',
  concept: 'merge-gate',
}

const JOINTS: Array<MapJoint> = [
  { id: 1, part: 'D1', needs: 'G1', trust: 'solid' },
  { id: 2, part: 'D2', needs: 'D1', trust: 'solid' },
  { id: 3, part: 'D2', needs: 'E1', trust: 'flagged' },
]

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  fitView.mockClear()
})

// The Map of the Project Glue, when its nodes have their places.
async function renderMap(props: Partial<ConceptMapProps> = {}) {
  const stay = (_: unknown, event: SyntheticEvent) => event.preventDefault()
  const handlers = {
    onExpandedChange: vi.fn(),
    onOpenPart: vi.fn(stay),
    onOpenConcept: vi.fn(stay),
  }
  render(
    <ConceptMap
      tree={TREE}
      parts={[G1, D1, E1, D2]}
      joints={JOINTS}
      focus="glue"
      expanded={[]}
      partHref={({ id }) => `/glue/${id}`}
      conceptHref={(slug) => `/glue/${slug}`}
      projectHref={(slug) => `/${slug}`}
      {...handlers}
      {...props}
    />,
  )
  await screen.findByRole('link', { name: /^People/ }, { timeout: 20_000 })
  // React Flow draws the lines one render after the nodes.
  await screen.findAllByRole('group', { name: / needs / })
  return handlers
}

function button(name: string | RegExp): HTMLElement {
  return screen.getByRole('button', { name })
}

function link(name: string | RegExp): HTMLElement {
  return screen.getByRole('link', { name })
}

// The card of a record.
function card(recordId: string): HTMLElement {
  return link(new RegExp(` ${recordId} `))
}

// The line of a bundle of Joints.
function line(name: string): HTMLElement {
  return screen.getByRole('group', { name })
}

// At opacity 0.25: not glued to what the pointer or the focus is on.
function isDimmed(element: HTMLElement): boolean {
  return element.closest(`.${styles.dimmed}`) !== null
}

describe('ConceptMap, the Map of a Project', () => {
  it('shows each top-level Concept closed: one that holds something opens in place, an empty one is a link', async () => {
    await renderMap()

    expect(button(/^Glue/).getAttribute('aria-expanded')).toBe('false')
    expect(button(/^Part model/).getAttribute('aria-expanded')).toBe('false')
    expect(button(/^Build run/).getAttribute('aria-expanded')).toBe('false')
    expect(link(/^People/).getAttribute('href')).toBe('/glue/people')
    expect(screen.queryByRole('link', { name: / D1 / })).toBeNull()
  })

  it('opens a closed Concept with a click, with Enter and with Space', async () => {
    const { onExpandedChange } = await renderMap({ expanded: ['people'] })

    await userEvent.click(button(/^Part model/))

    expect(onExpandedChange).toHaveBeenLastCalledWith(['people', 'part-model'])

    button(/^Build run/).focus()
    await userEvent.keyboard('{Enter}')

    expect(onExpandedChange).toHaveBeenLastCalledWith(['people', 'build-run'])

    await userEvent.keyboard(' ')

    expect(onExpandedChange).toHaveBeenCalledTimes(3)
  })

  it('shows the Parts of an open Concept that has no sub Concept, and closes it with its head', async () => {
    const { onExpandedChange } = await renderMap({
      expanded: ['part-model', 'build-run'],
    })

    expect(card('D1').getAttribute('href')).toBe('/glue/D1')
    card('E1')

    await userEvent.click(
      screen.getByRole('button', { name: 'Part model', expanded: true }),
    )

    expect(onExpandedChange).toHaveBeenLastCalledWith(['build-run'])
  })

  it('shows the sub Concepts of an open Concept, not its Parts', async () => {
    await renderMap({ expanded: ['build-run'] })

    expect(link(/^Merge gate/).getAttribute('href')).toBe('/glue/merge-gate')
    link(/^Verify/)
    expect(screen.queryByRole('link', { name: / D2 / })).toBeNull()
  })

  it('opens an open Concept in the panel with the icon button of its head', async () => {
    const { onOpenConcept } = await renderMap({ expanded: ['part-model'] })

    await userEvent.click(button('Show Part model in the panel'))

    expect(onOpenConcept).toHaveBeenLastCalledWith(
      'part-model',
      expect.anything(),
    )

    button('Show Part model in the panel').focus()
    await userEvent.keyboard('{Enter}')

    expect(onOpenConcept).toHaveBeenCalledTimes(2)
  })

  it('opens a Part and a sub Concept in the panel with a click or with Enter', async () => {
    const { onOpenPart, onOpenConcept } = await renderMap({
      expanded: ['part-model', 'build-run'],
    })

    await userEvent.click(card('D1'))

    expect(onOpenPart).toHaveBeenLastCalledWith(D1, expect.anything())

    link(/^Merge gate/).focus()
    await userEvent.keyboard('{Enter}')

    expect(onOpenConcept).toHaveBeenLastCalledWith(
      'merge-gate',
      expect.anything(),
    )
  })

  it('draws one line per bundle of Joints, named with the count and the worst Trust', async () => {
    await renderMap()

    line('Part model needs Glue: 1 Joint, solid')
    expect(
      line('Build run needs Part model: 2 Joints, flagged').textContent,
    ).toBe('2')
  })

  it('takes the focus on the nodes first and on the lines after them', async () => {
    await renderMap()

    const bundle = line('Build run needs Part model: 2 Joints, flagged')

    expect(bundle.tabIndex).toBe(0)
    expect(
      link(/^People/).compareDocumentPosition(bundle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('marks the node that the panel shows as current: a closed Concept, a Part or an open Concept', async () => {
    await renderMap({ expanded: ['build-run'], current: 'merge-gate' })

    expect(link(/^Merge gate/).getAttribute('aria-current')).toBe('true')
    expect(link(/^Verify/).getAttribute('aria-current')).toBeNull()

    cleanup()
    await renderMap({ expanded: ['part-model'], current: 'D1' })

    expect(card('D1').getAttribute('aria-current')).toBe('true')
    expect(card('E1').getAttribute('aria-current')).toBeNull()

    cleanup()
    await renderMap({ expanded: ['part-model'], current: 'part-model' })

    expect(
      screen
        .getByRole('button', { name: 'Part model', expanded: true })
        .getAttribute('aria-current'),
    ).toBe('true')
  })

  it('has the buttons that make the Map bigger and smaller', async () => {
    await renderMap()

    button('Zoom In')
    button('Zoom Out')
  })
})

// A Map that opens and closes its Concepts, as the address does in the app.
function OpenableMap() {
  const [expanded, setExpanded] = useState<Array<string>>([])
  return (
    <ConceptMap
      tree={TREE}
      parts={[G1, D1, E1, D2]}
      joints={JOINTS}
      focus="glue"
      expanded={expanded}
      onExpandedChange={setExpanded}
      partHref={({ id }) => `/glue/${id}`}
      conceptHref={(slug) => `/glue/${slug}`}
      projectHref={(slug) => `/${slug}`}
    />
  )
}

describe('ConceptMap, the fit', () => {
  // The whole Map, at its full size at most. The floor: the title of a
  // Concept, 14 px, shows at 12 px at least.
  const whole = expect.objectContaining({ minZoom: 12 / 14, maxZoom: 1 })

  it('fits the whole Map into its frame at first sight', async () => {
    await renderMap()

    await waitFor(() => expect(fitView).toHaveBeenLastCalledWith(whole))
  })

  it('fits the whole Map again after a Concept opens, and after it closes', async () => {
    render(<OpenableMap />)
    const closed = await screen.findByRole(
      'button',
      { name: /^Build run/, expanded: false },
      { timeout: 20_000 },
    )
    await waitFor(() => expect(fitView).toHaveBeenCalled())
    fitView.mockClear()

    await userEvent.click(closed)
    const head = await screen.findByRole('button', {
      name: 'Build run',
      expanded: true,
    })

    await waitFor(() => expect(fitView).toHaveBeenLastCalledWith(whole))
    fitView.mockClear()

    await userEvent.click(head)
    await screen.findByRole('button', { name: /^Build run/, expanded: false })

    await waitFor(() => expect(fitView).toHaveBeenLastCalledWith(whole))
  })
})

describe('ConceptMap, the focus after a key', () => {
  it('is on the head of the Concept that Enter opened, and on the Concept that Enter closed', async () => {
    render(<OpenableMap />)
    const closed = await screen.findByRole(
      'button',
      { name: /^Build run/, expanded: false },
      { timeout: 20_000 },
    )

    closed.focus()
    await userEvent.keyboard('{Enter}')
    const head = await screen.findByRole('button', {
      name: 'Build run',
      expanded: true,
    })

    await waitFor(() => expect(document.activeElement).toBe(head))

    await userEvent.keyboard('{Enter}')

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: /^Build run/, expanded: false }),
      ),
    )
  })
})

describe('ConceptMap, the Map of a Concept', () => {
  it('shows the Concept open with no way to close it, and the Concepts glued to it closed', async () => {
    render(
      <ConceptMap
        tree={TREE}
        parts={[G1, D1, E1, D2]}
        joints={JOINTS}
        focus="part-model"
        expanded={[]}
        partHref={({ id }) => `/glue/${id}`}
        conceptHref={(slug) => `/glue/${slug}`}
        projectHref={(slug) => `/${slug}`}
        onExpandedChange={() => {}}
      />,
    )
    await screen.findByRole('link', { name: / D1 / }, { timeout: 20_000 })

    card('E1')
    button('Show Part model in the panel')
    expect(screen.queryByRole('button', { name: 'Part model' })).toBeNull()
    expect(button(/^Glue/).getAttribute('aria-expanded')).toBe('false')
    expect(button(/^Build run/).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('People')).toBeNull()
  })
})

describe('ConceptMap, the pointer and the focus', () => {
  it('keeps what is glued to the node under the pointer, until 250 ms after the pointer leaves', async () => {
    await renderMap()
    vi.useFakeTimers()

    fireEvent.mouseEnter(button(/^Glue/))

    expect(isDimmed(button(/^Glue/))).toBe(false)
    expect(isDimmed(button(/^Part model/))).toBe(false)
    expect(isDimmed(line('Part model needs Glue: 1 Joint, solid'))).toBe(false)
    expect(isDimmed(button(/^Build run/))).toBe(true)
    expect(isDimmed(link(/^People/))).toBe(true)
    expect(
      isDimmed(line('Build run needs Part model: 2 Joints, flagged')),
    ).toBe(true)
    expect(isDimmed(screen.getByText('2'))).toBe(true)

    fireEvent.mouseLeave(button(/^Glue/))
    act(() => void vi.advanceTimersByTime(249))

    expect(isDimmed(button(/^Build run/))).toBe(true)

    act(() => void vi.advanceTimersByTime(1))

    expect(isDimmed(button(/^Build run/))).toBe(false)
    expect(isDimmed(link(/^People/))).toBe(false)
  })

  it('shows no normal state on the way from one node to the next', async () => {
    await renderMap()
    vi.useFakeTimers()

    fireEvent.mouseEnter(button(/^Glue/))
    fireEvent.mouseLeave(button(/^Glue/))
    act(() => void vi.advanceTimersByTime(100))
    fireEvent.mouseEnter(button(/^Build run/))

    expect(isDimmed(button(/^Glue/))).toBe(true)
    expect(isDimmed(button(/^Build run/))).toBe(false)

    act(() => void vi.advanceTimersByTime(250))

    expect(isDimmed(button(/^Glue/))).toBe(true)
  })

  it('keeps what is glued to the line under the pointer', async () => {
    await renderMap()

    fireEvent.mouseEnter(line('Part model needs Glue: 1 Joint, solid'))

    expect(isDimmed(button(/^Glue/))).toBe(false)
    expect(isDimmed(button(/^Part model/))).toBe(false)
    expect(isDimmed(button(/^Build run/))).toBe(true)
  })

  it('does the same for the keyboard focus on a node or on a line', async () => {
    await renderMap()
    vi.useFakeTimers()

    act(() => button(/^Glue/).focus())

    expect(isDimmed(button(/^Build run/))).toBe(true)

    act(() => line('Build run needs Part model: 2 Joints, flagged').focus())

    expect(isDimmed(button(/^Glue/))).toBe(true)
    expect(isDimmed(button(/^Build run/))).toBe(false)

    act(() => line('Build run needs Part model: 2 Joints, flagged').blur())
    act(() => void vi.advanceTimersByTime(250))

    expect(isDimmed(button(/^Glue/))).toBe(false)
  })
})
