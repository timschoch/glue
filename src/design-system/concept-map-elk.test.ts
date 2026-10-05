// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { layoutMapView, placeMapStart } from './concept-map-elk.ts'
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

describe('placeMapStart', () => {
  const frame = { width: 1000, height: 600 }
  const box = (left: number, width: number) => ({
    id: 'concept:open',
    x: left,
    y: 50,
    left,
    top: 50,
    width,
    height: 64,
  })
  const wide = (left: number, width: number) => ({
    width: 3000,
    height: 200,
    boxes: [box(left, width)],
    routes: [],
  })

  it('puts a Map that fits its frame in the middle', () => {
    expect(
      placeMapStart(
        { width: 400, height: 200, boxes: [], routes: [] },
        frame,
        undefined,
      ),
    ).toEqual({ x: 300, y: 200 })
  })

  it('puts the node in the middle of the frame when the Map is wider', () => {
    expect(placeMapStart(wide(1400, 200), frame, 'concept:open')).toEqual({
      x: -1000,
      y: 200,
    })
  })

  it('shows no room before the start and after the end of the Map', () => {
    expect(placeMapStart(wide(0, 200), frame, 'concept:open').x).toBe(0)
    expect(placeMapStart(wide(2800, 200), frame, 'concept:open').x).toBe(-2000)
  })

  it('shows the start of a node that is wider than the frame', () => {
    expect(placeMapStart(wide(500, 1500), frame, 'concept:open').x).toBe(-476)
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
