// The ELK adapter of the Map: nodes and lines in, their places out.
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode } from 'elkjs/lib/elk.bundled.js'

import type { MapNode, MapView } from './concept-map-layout.ts'

export type MapPoint = { x: number; y: number }

export type MapBox = {
  id: string
  // The place in the group, or on the Map for a node without a group.
  x: number
  y: number
  // The place on the Map.
  left: number
  top: number
  width: number
  height: number
  parent?: string
}

export type MapRoute = {
  id: string
  // From the start of the line to its end.
  points: Array<MapPoint>
  // The middle of the pill with the count.
  pill: MapPoint
}

export type MapLayout = {
  width: number
  height: number
  boxes: Array<MapBox>
  routes: Array<MapRoute>
}

// The size of a node without content, in pixels.
const sizes: { [kind in MapNode['kind']]: { width: number; height: number } } =
  {
    concept: { width: 208, height: 64 },
    part: { width: 256, height: 72 },
    project: { width: 208, height: 64 },
  }

// The head of an open Concept: its name and its buttons.
export const HEAD_HEIGHT = 40
export const PILL = { width: 24, height: 16 }

// The spacing keeps parallel lines apart. On the Map and in each group.
const spacing = {
  'elk.spacing.nodeNode': '20',
  'elk.spacing.edgeEdge': '10',
  'elk.spacing.edgeNode': '12',
  'elk.layered.spacing.nodeNodeBetweenLayers': '56',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '10',
  'elk.layered.spacing.edgeNodeBetweenLayers': '14',
}

const rootOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.json.edgeCoords': 'ROOT',
  'elk.layered.mergeEdges': 'false',
  'elk.layered.feedbackEdges': 'true',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.thoroughness': '30',
  'elk.partitioning.activate': 'true',
  'elk.padding': '[top=24,left=24,bottom=24,right=24]',
  ...spacing,
}

const groupOptions = {
  'elk.padding': `[top=${HEAD_HEIGHT},left=16,bottom=16,right=16]`,
  ...spacing,
}

// The room between the start of the frame and a node that is bigger than it.
const START_ROOM = 24

// Where the Map lies in its frame at the start, at its full size. A Map that
// fits is in the middle. A bigger Map shows the node `id` in the middle, as far
// as the edges of the Map allow, or the start of a node that does not fit.
export function placeMapStart(
  layout: MapLayout,
  frame: { width: number; height: number },
  id: string | undefined,
): MapPoint {
  const box = layout.boxes.find((found) => found.id === id)

  function place(size: number, room: number, start = 0, length = 0) {
    if (room >= size) return (room - size) / 2
    const offset =
      length > room ? START_ROOM - start : room / 2 - (start + length / 2)
    return Math.min(0, Math.max(room - size, offset))
  }

  return {
    x: place(layout.width, frame.width, box?.left, box?.width),
    y: place(layout.height, frame.height, box?.top, box?.height),
  }
}

const elk = new ELK()

// Where a line crosses the border of a group, ELK is off by up to half a
// pixel, which draws as a slanted line. Pull each such segment straight.
function straighten(points: Array<MapPoint>) {
  for (let index = 1; index < points.length; index += 1) {
    const [from, to] = [points[index - 1], points[index]]
    const dx = Math.abs(from.x - to.x)
    const dy = Math.abs(from.y - to.y)
    if (dy > 0 && dy < 1 && dx >= 1) to.y = from.y
    else if (dx > 0 && dx < 1 && dy >= 1) to.x = from.x
  }
}

type Area = { left: number; top: number; width: number; height: number }

// The first value that differs decides.
function isLower(rank: ReadonlyArray<number>, other: ReadonlyArray<number>) {
  const place = rank.findIndex((value, index) => value !== other[index])
  return place !== -1 && rank[place] < other[place]
}

// Each pill goes to the place of its line that covers the least: no node, no
// other pill, no other line, and not the end of the line. Among equal places
// the longest segment wins, then the place nearest its middle.
function placePills(
  routes: ReadonlyArray<{ id: string; points: Array<MapPoint> }>,
  blocked: ReadonlyArray<Area>,
): Array<MapRoute> {
  const half = { x: PILL.width / 2 + 2, y: PILL.height / 2 + 2 }
  const placed: Array<MapPoint> = []

  return routes.map((route) => {
    const end = route.points.at(-1) ?? { x: 0, y: 0 }
    let best: { rank: Array<number>; pill: MapPoint } | undefined
    for (let index = 1; index < route.points.length; index += 1) {
      const [from, to] = [route.points[index - 1], route.points[index]]
      const length = Math.hypot(from.x - to.x, from.y - to.y)
      for (let at = 0; at <= length; at += 6) {
        const share = length === 0 ? 0 : at / length
        const pill = {
          x: from.x + (to.x - from.x) * share,
          y: from.y + (to.y - from.y) * share,
        }
        const isOnBox = blocked.some(
          (box) =>
            pill.x + half.x > box.left &&
            pill.x - half.x < box.left + box.width &&
            pill.y + half.y > box.top &&
            pill.y - half.y < box.top + box.height,
        )
        const isOnPill = placed.some(
          (other) =>
            Math.abs(other.x - pill.x) < half.x * 2 &&
            Math.abs(other.y - pill.y) < half.y * 2,
        )
        const isOnLine = routes.some(
          (other) =>
            other !== route &&
            other.points.some((point, next) => {
              if (next === 0) return false
              const before = other.points[next - 1]
              return (
                Math.max(before.x, point.x) >= pill.x - half.x &&
                Math.min(before.x, point.x) <= pill.x + half.x &&
                Math.max(before.y, point.y) >= pill.y - half.y &&
                Math.min(before.y, point.y) <= pill.y + half.y
              )
            }),
        )
        const isAtEnd = Math.hypot(pill.x - end.x, pill.y - end.y) < half.x + 14
        const rank = [
          8 * Number(isOnBox) +
            4 * Number(isOnPill) +
            2 * Number(isOnLine) +
            Number(isAtEnd),
          -Math.min(length, 400),
          Math.abs(at - length / 2),
        ]
        if (!best || isLower(rank, best.rank)) best = { rank, pill }
      }
    }
    const pill = best?.pill ?? end
    placed.push(pill)
    return { ...route, pill }
  })
}

// The places of the nodes and of the lines of a Map. The columns go from
// left to right in the order of their partitions. A line has right angles.
export async function layoutMapView(view: MapView): Promise<MapLayout> {
  function toElkNode(node: MapNode): ElkNode {
    const inside = view.nodes.filter(({ parent }) => parent === node.id)
    const partition =
      node.partition === undefined
        ? undefined
        : { 'elk.partitioning.partition': String(node.partition) }
    return node.kind === 'concept' && node.open
      ? {
          id: node.id,
          layoutOptions: { ...groupOptions, ...partition },
          // An open Concept with nothing in it keeps the size of a node.
          ...(inside.length === 0 && sizes.concept),
          children: inside.map(toElkNode),
        }
      : { id: node.id, ...sizes[node.kind], layoutOptions: { ...partition } }
  }

  const graph = await elk.layout<ElkNode>({
    id: 'map',
    layoutOptions: rootOptions,
    children: view.nodes
      .filter(({ parent }) => parent === undefined)
      .map(toElkNode),
    // ELK lays a flipped line out from its end to its start: it then runs
    // straight back and not round the Map.
    edges: view.lines.map(({ id, from, to, flipped }) => ({
      id,
      sources: [flipped ? to : from],
      targets: [flipped ? from : to],
    })),
  })

  const boxes: Array<MapBox> = []
  function addBoxes(node: ElkNode, left: number, top: number, parent?: string) {
    for (const child of node.children ?? []) {
      const { x = 0, y = 0, width = 0, height = 0 } = child
      boxes.push({
        id: child.id,
        x,
        y,
        left: left + x,
        top: top + y,
        width,
        height,
        parent,
      })
      addBoxes(child, left + x, top + y, child.id)
    }
  }
  addBoxes(graph, 0, 0)

  const flipped = new Set(
    view.lines.filter((line) => line.flipped).map(({ id }) => id),
  )
  const routes = (graph.edges ?? []).map((edge) => {
    const points = (edge.sections ?? []).flatMap((section) =>
      [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(
        ({ x, y }) => ({ x, y }),
      ),
    )
    if (flipped.has(edge.id)) points.reverse()
    straighten(points)
    return { id: edge.id, points }
  })

  // A pill covers no node and no head of a group.
  const groups = new Set(boxes.map(({ parent }) => parent))
  const blocked = boxes.map((box) =>
    groups.has(box.id) ? { ...box, height: HEAD_HEIGHT } : box,
  )

  return {
    width: graph.width ?? 0,
    height: graph.height ?? 0,
    boxes,
    routes: placePills(routes, blocked),
  }
}
