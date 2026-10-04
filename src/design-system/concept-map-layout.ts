// The layout of the map of a Concept: the nodes in layers from top to
// bottom, and one line per Joint. All sizes are in rem.

export const NODE_WIDTH = 13
export const NODE_HEIGHT = 8
// The room between two nodes of one layer.
export const NODE_GAP = 1
// The room between two layers: the lines of the Joints cross it.
export const LAYER_GAP = 3

// A node, and the highest layer that it may have.
export type MapNode = { id: string; rank: number }

// `part` needs `needs`. The ids are the ids of two nodes.
export type MapJoint = {
  id: number
  part: string
  needs: string
  twoWay: boolean
}

export type MapLayout = {
  width: number
  height: number
  // The upper start corner of each node.
  places: Record<string, { left: number; top: number }>
  // One SVG path per Joint that has both its nodes on the map.
  lines: Array<{ id: number; path: string }>
}

function mean(values: ReadonlyArray<number>): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

// The ids of the nodes, layer by layer from the top. A node is in the layer
// of its rank, or below each node that it needs. A two-way Joint moves no
// node: both nodes need each other. A layer has the nodes in the order of
// the nodes above that they are glued to, then in the order they came in.
export function layoutLayers(
  nodes: ReadonlyArray<MapNode>,
  joints: ReadonlyArray<MapJoint>,
): Array<Array<string>> {
  const ranks = new Map(nodes.map(({ id, rank }) => [id, rank]))
  const glued = joints.filter(
    ({ part, needs }) => part !== needs && ranks.has(part) && ranks.has(needs),
  )

  const depths = new Map<string, number>()
  const open = new Set<string>()
  // Joints in a circle: the node that closes the circle counts with its rank.
  function findDepth(id: string): number {
    const rank = ranks.get(id) ?? 0
    const known = depths.get(id)
    if (known !== undefined) return known
    if (open.has(id)) return rank
    open.add(id)
    const depth = Math.max(
      rank,
      ...glued
        .filter(({ part, twoWay }) => part === id && !twoWay)
        .map(({ needs }) => findDepth(needs) + 1),
    )
    open.delete(id)
    depths.set(id, depth)
    return depth
  }
  for (const { id } of nodes) findDepth(id)

  const used = [...new Set(depths.values())].sort((one, other) => one - other)
  // The place of each node in its layer, with zero in the middle.
  const offsets = new Map<string, number>()

  return used.map((depth) => {
    const layer = nodes
      .filter(({ id }) => depths.get(id) === depth)
      .map(({ id }, index) => {
        const above = glued
          .flatMap(({ part, needs }) =>
            part === id ? [needs] : needs === id ? [part] : [],
          )
          .flatMap((other) => offsets.get(other) ?? [])
        return {
          id,
          index,
          pull: above.length > 0 ? mean(above) : Infinity,
        }
      })
      .sort(
        (one, other) =>
          // Infinity minus Infinity is no number: equal pulls keep their order.
          (one.pull === other.pull ? 0 : one.pull - other.pull) ||
          one.index - other.index,
      )
      .map(({ id }) => id)
    layer.forEach((id, index) =>
      offsets.set(id, index - (layer.length - 1) / 2),
    )
    return layer
  })
}

// The places of the nodes of the layers, and the lines of the Joints. Each
// layer is in the middle of the map. A line goes from the lower edge of the
// upper node to the upper edge of the lower node. In one layer it goes from
// side to side.
export function layoutMap(
  layers: ReadonlyArray<ReadonlyArray<string>>,
  joints: ReadonlyArray<MapJoint>,
): MapLayout {
  const widthOf = (count: number) =>
    count * NODE_WIDTH + Math.max(count - 1, 0) * NODE_GAP
  const width = Math.max(0, ...layers.map((layer) => widthOf(layer.length)))
  const height = widthOfLayers(layers.length)

  const places: MapLayout['places'] = {}
  layers.forEach((layer, depth) => {
    const start = (width - widthOf(layer.length)) / 2
    layer.forEach((id, index) => {
      places[id] = {
        left: start + index * (NODE_WIDTH + NODE_GAP),
        top: depth * (NODE_HEIGHT + LAYER_GAP),
      }
    })
  })

  const lines = joints.flatMap(({ id, part, needs }) => {
    if (!Object.hasOwn(places, part) || !Object.hasOwn(places, needs)) {
      return []
    }
    const ends = [places[part], places[needs]]
    if (ends[0].top === ends[1].top) {
      const [first, second] = ends.sort((one, other) => one.left - other.left)
      const middle = first.top + NODE_HEIGHT / 2
      return {
        id,
        path: `M ${first.left + NODE_WIDTH} ${middle} L ${second.left} ${middle}`,
      }
    }
    const [upper, lower] = ends.sort((one, other) => one.top - other.top)
    const from = upper.left + NODE_WIDTH / 2
    const to = lower.left + NODE_WIDTH / 2
    const fromTop = upper.top + NODE_HEIGHT
    const bend = (fromTop + lower.top) / 2
    return {
      id,
      path: `M ${from} ${fromTop} C ${from} ${bend}, ${to} ${bend}, ${to} ${lower.top}`,
    }
  })

  return { width, height, places, lines }
}

function widthOfLayers(count: number): number {
  return count * NODE_HEIGHT + Math.max(count - 1, 0) * LAYER_GAP
}
