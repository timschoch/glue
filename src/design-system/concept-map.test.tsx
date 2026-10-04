// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { LAYER_GAP, NODE_HEIGHT } from './concept-map-layout.ts'
import { ConceptMap } from './concept-map.tsx'
import type { ConceptMapProps } from './concept-map.tsx'

type Concept = ConceptMapProps['concept']
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

function joint(id: number, from: string, needs: string, twoWay = false) {
  return { id, part: from, needs, twoWay }
}

const CONCEPT: Concept = {
  concepts: [],
  parts: [
    part('I7', 'insight', 'Bakers want step videos'),
    part('G2', 'goal', 'First bake feels easy'),
    part('D12', 'decision', 'Show the video of the creator'),
    part('F5', 'flow', 'Watch a technique while baking'),
    part('R4', 'guardrail', 'Only the videos of the creator'),
  ],
  linkedParts: [],
  slots: [],
  joints: [
    joint(1, 'D12', 'G2'),
    joint(2, 'D12', 'I7'),
    joint(3, 'F5', 'D12'),
    joint(4, 'R4', 'D12'),
  ],
}

afterEach(cleanup)

function renderMap(props: Partial<ConceptMapProps> = {}) {
  return render(
    <ConceptMap
      concept={CONCEPT}
      partHref={({ id }) => `#${id}`}
      conceptHref={({ slug }) => `#${slug}`}
      {...props}
    />,
  )
}

// The node of the map that holds the link or the button with the name.
function node(name: RegExp, role: 'link' | 'button' = 'link'): HTMLElement {
  const item = screen.getByRole(role, { name }).closest('li')
  if (!item) throw new Error(`no node ${name}`)
  return item
}

// The lines of the Joints: the first drawing of the map. The other drawings
// are the signs of the cards.
function jointLines(container: HTMLElement): Array<Element> {
  return [...(container.querySelector('svg')?.querySelectorAll('path') ?? [])]
}

// The layer of a node, from its place.
function layer(name: RegExp, role?: 'link' | 'button'): number {
  return parseFloat(node(name, role).style.top) / (NODE_HEIGHT + LAYER_GAP)
}

describe('ConceptMap', () => {
  it('shows each Part as one node: the sign, the type line and the title', () => {
    renderMap()

    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    const card = screen.getByRole('link', { name: /D12/ })
    expect(card.getAttribute('href')).toBe('#D12')
    expect(card.textContent).toContain(
      'Decision D12 Show the video of the creator',
    )
    within(card).getByLabelText('Solid')
  })

  it('has a Part below the Parts that it needs', () => {
    renderMap()

    expect(layer(/G2/)).toBe(0)
    expect(layer(/I7/)).toBe(0)
    expect(layer(/D12/)).toBe(1)
    expect(layer(/F5/)).toBe(2)
    expect(layer(/R4/)).toBe(3)
  })

  it('draws one line per Joint, all in one style, outside the names', () => {
    const { container } = renderMap()

    const lines = jointLines(container)
    expect(lines).toHaveLength(4)
    expect(new Set(lines.map((line) => line.getAttribute('class'))).size).toBe(
      1,
    )
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    )
  })

  it('opens the record of a node with a click', async () => {
    const onOpenPart = vi.fn()
    renderMap({ onOpenPart })

    await userEvent.click(screen.getByRole('link', { name: /D12/ }))

    expect(onOpenPart).toHaveBeenCalledOnce()
    expect(onOpenPart.mock.calls[0][0]).toMatchObject({ id: 'D12' })
  })

  it('names the Concept on the node of a Part of another Concept', () => {
    renderMap({
      concept: {
        ...CONCEPT,
        linkedParts: [
          {
            ...part('I21', 'insight', 'Novices stop at long videos'),
            concept: 'ux-study',
            conceptTitle: 'UX study',
          },
        ],
        joints: [...CONCEPT.joints, joint(5, 'D12', 'I21')],
      },
    })

    expect(screen.getByRole('link', { name: /I21/ }).textContent).toContain(
      'UX study',
    )
    expect(screen.getByRole('link', { name: /I7/ }).textContent).not.toContain(
      'Technique videos',
    )
    expect(layer(/I21/)).toBe(0)
  })

  it('shows an empty slot as a node that adds a Part of its type', async () => {
    const onAddPart = vi.fn()
    renderMap({
      concept: {
        ...CONCEPT,
        slots: [
          { type: 'goal', filled: true },
          { type: 'metric', filled: false },
        ],
      },
      onAddPart,
    })

    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(layer(/Add Metric/, 'button')).toBe(3)
    await userEvent.click(screen.getByRole('button', { name: 'Add Metric' }))

    expect(onAddPart).toHaveBeenCalledExactlyOnceWith('metric')
  })

  it('shows the type of an empty slot when no Part can be added', () => {
    renderMap({
      concept: { ...CONCEPT, slots: [{ type: 'metric', filled: false }] },
    })

    expect(screen.queryByRole('button')).toBeNull()
    screen.getByText('Metric')
  })

  it('shows a Concept inside as a surface with its name, below the Parts', async () => {
    const onOpenConcept = vi.fn()
    renderMap({
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
        ],
      },
      onOpenConcept,
    })

    const surface = screen.getByRole('link', { name: /Step videos/ })
    expect(surface.getAttribute('href')).toBe('#step-videos')
    expect(surface.textContent).toContain('12 Parts')
    expect(layer(/Step videos/)).toBe(4)
    await userEvent.click(surface)

    expect(onOpenConcept).toHaveBeenCalledOnce()
    expect(onOpenConcept.mock.calls[0][0]).toMatchObject({
      slug: 'step-videos',
    })
  })

  it('shows only the Part types of the lens, with the Joints between them', () => {
    const { container } = renderMap({ types: ['goal', 'decision'] })

    expect(
      screen.getAllByRole('link').map((link) => link.getAttribute('href')),
    ).toEqual(['#G2', '#D12'])
    expect(jointLines(container)).toHaveLength(1)
  })

  it('says that a Concept has no Parts', () => {
    renderMap({ concept: { ...CONCEPT, parts: [], joints: [] } })

    screen.getByText('No Parts')
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('has no words about Parts with a lens that has no Part type', () => {
    const { container } = renderMap({ types: [] })

    expect(container.textContent).toBe('')
  })
})
