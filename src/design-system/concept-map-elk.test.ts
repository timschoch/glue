// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { layoutMapView } from './concept-map-elk.ts'
import type { MapNode, MapView } from './concept-map-layout.ts'

function concept(
  slug: string,
  place: { partition?: number; parent?: string; open?: boolean },
): MapNode {
  return {
    kind: 'concept',
    id: `concept:${slug}`,
    slug,
    title: slug,
    count: 1,
    open: false,
    expandable: false,
    outside: false,
    ...place,
  }
}

const line = { count: 1, trust: 'solid', dashed: false } as const

// Three columns. The Concept in the middle is open around one Concept.
const VIEW: MapView = {
  nodes: [
    concept('first', { partition: 0 }),
    concept('second', { partition: 1, open: true }),
    concept('inside', { parent: 'concept:second' }),
    concept('third', { partition: 2 }),
  ],
  lines: [
    {
      ...line,
      id: 'concept:third>concept:first',
      from: 'concept:third',
      to: 'concept:first',
      flipped: true,
    },
    {
      ...line,
      id: 'concept:inside>concept:third',
      from: 'concept:inside',
      to: 'concept:third',
      flipped: false,
    },
  ],
}

// One level of Concepts, each in its own column. A line goes from the first
// Concept to the last one.
function level(count: number): MapView {
  const slugs = Array.from({ length: count }, (_, rank) => `c${rank}`)
  const [from, to] = [`concept:${slugs[0]}`, `concept:${slugs[count - 1]}`]
  return {
    nodes: slugs.map((slug, partition) => concept(slug, { partition })),
    lines: [{ ...line, id: `${from}>${to}`, from, to, flipped: false }],
  }
}

// A row ends where the next column is not to the right of the one before.
function countRows(boxes: ReadonlyArray<{ left: number }>): number {
  return boxes.filter(
    (box, rank) => rank === 0 || box.left <= boxes[rank - 1].left,
  ).length
}

// The Map of the live Project `glue`: six columns. Each Concept needs the
// first one, and some need a Concept further right.
function live(): MapView {
  const pairs = [
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
    [5, 0],
    [2, 4],
    [1, 4],
    [3, 4],
    [2, 5],
    [4, 5],
    [1, 3],
  ]
  return {
    nodes: Array.from({ length: 6 }, (_, partition) =>
      concept(`c${partition}`, { partition }),
    ),
    lines: pairs.map(([from, to]) => ({
      ...line,
      id: `concept:c${from}>concept:c${to}`,
      from: `concept:c${from}`,
      to: `concept:c${to}`,
      flipped: from > to,
    })),
  }
}

// The frame of the Map in a window of 1440 px by 900 px, 1120 px by 534 px,
// less the room around the Map, at the smallest zoom.
const ROOM = { width: 1250, height: 567 }

describe('layoutMapView, in a frame', () => {
  it.each([7, 12])(
    'starts a new row for %i Concepts in one level, so the Map is no wider than the frame',
    async (count) => {
      const view = level(count)
      const { width, boxes, routes } = await layoutMapView(view, ROOM)

      expect(width).toBeLessThanOrEqual(ROOM.width)
      expect(boxes).toHaveLength(count)
      expect(countRows(boxes)).toBeGreaterThan(1)
      expect(boxes.every((box) => box.left + box.width <= width)).toBe(true)
      // The rows read from left to right, then down.
      for (const [rank, box] of boxes.entries()) {
        const next = boxes.at(rank + 1)
        if (!next) continue
        expect(next.left > box.left || next.top >= box.top + box.height).toBe(
          true,
        )
      }
      // Only the lines of the view show, each with right angles.
      expect(routes.map(({ id }) => id)).toEqual(view.lines.map(({ id }) => id))
      for (const { points } of routes) {
        expect(points.length).toBeGreaterThan(1)
        expect(
          points
            .slice(1)
            .every(
              (point, index) =>
                point.x === points[index].x || point.y === points[index].y,
            ),
        ).toBe(true)
      }
    },
  )

  it('puts six Concepts that all need the first one into the frame, with each line', async () => {
    const view = live()
    const { width, height, boxes, routes } = await layoutMapView(view, ROOM)

    expect(width).toBeLessThanOrEqual(ROOM.width)
    expect(height).toBeLessThanOrEqual(ROOM.height)
    expect(boxes).toHaveLength(6)
    expect(routes).toHaveLength(view.lines.length)
    for (const { x, y } of routes.flatMap(({ points }) => points)) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(width)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(height)
    }
  })

  it('keeps one row when the level fits the frame', async () => {
    const { boxes } = await layoutMapView(level(3), ROOM)

    expect(countRows(boxes)).toBe(1)
  })

  it('keeps one row without a frame', async () => {
    const { boxes } = await layoutMapView(level(7))

    expect(countRows(boxes)).toBe(1)
  })
})

describe('layoutMapView', () => {
  it('puts the columns in their order from left to right', async () => {
    const { boxes } = await layoutMapView(VIEW)
    const left = (id: string) => boxes.find((box) => box.id === id)?.left ?? 0

    expect(left('concept:first')).toBeLessThan(left('concept:second'))
    expect(left('concept:second')).toBeLessThan(left('concept:third'))
  })

  it('puts a node into its group, below the head of the group', async () => {
    const { boxes } = await layoutMapView(VIEW)
    const group = boxes.find((box) => box.id === 'concept:second')
    const inside = boxes.find((box) => box.id === 'concept:inside')

    expect(inside?.parent).toBe('concept:second')
    expect(inside?.y).toBeGreaterThanOrEqual(40)
    expect((inside?.y ?? 0) + (inside?.height ?? 0)).toBeLessThan(
      group?.height ?? 0,
    )
  })

  it('routes a flipped line from its start to its end, with straight segments', async () => {
    const { boxes, routes } = await layoutMapView(VIEW)
    const route = routes.find(({ id }) => id === 'concept:third>concept:first')
    const third = boxes.find((box) => box.id === 'concept:third')
    const first = boxes.find((box) => box.id === 'concept:first')
    const points = route?.points ?? []

    expect(points.at(0)?.x).toBe(third?.left)
    expect(points.at(-1)?.x).toBe((first?.left ?? 0) + (first?.width ?? 0))
    expect(
      points
        .slice(1)
        .every(
          (point, index) =>
            point.x === points[index].x || point.y === points[index].y,
        ),
    ).toBe(true)
  })

  it('puts the pill of a line on the line', async () => {
    const { routes } = await layoutMapView(VIEW)

    for (const { points, pill } of routes) {
      const xs = points.map(({ x }) => x)
      const ys = points.map(({ y }) => y)

      expect(pill.x).toBeGreaterThanOrEqual(Math.min(...xs))
      expect(pill.x).toBeLessThanOrEqual(Math.max(...xs))
      expect(pill.y).toBeGreaterThanOrEqual(Math.min(...ys))
      expect(pill.y).toBeLessThanOrEqual(Math.max(...ys))
    }
  })
})
