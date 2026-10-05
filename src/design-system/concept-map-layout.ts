// What the Map shows: its nodes and its lines, before any place on the
// screen. The places come from ELK.
import type { PartType, Trust } from './card.tsx'

export type MapPart = {
  // The record id, for example D12.
  id: string
  type: PartType
  title: string
  trust: Trust
  // The slug of the home Concept.
  concept: string
}

export type MapConcept = {
  slug: string
  title: string
  concepts: ReadonlyArray<MapConcept>
}

// `part` needs `needs`: two record ids.
export type MapJoint = {
  id: number
  part: string
  needs: string
  // The Trust of the needed Part.
  trust: Trust
  // The end that is a Part of another Project, and that Project.
  reference?: { end: 'part' | 'needs'; slug: string; name: string }
}

type ConceptMapNode = {
  kind: 'concept'
  id: string
  slug: string
  title: string
  // The Parts of the Concept and of the Concepts in it.
  count: number
  // Open: a group with its content as nodes inside.
  open: boolean
  expandable: boolean
}

type PartMapNode = { kind: 'part'; id: string; part: MapPart }

// Another Project that a reference leads to.
type ProjectMapNode = {
  kind: 'project'
  id: string
  slug: string
  title: string
}

export type MapNode = (ConceptMapNode | PartMapNode | ProjectMapNode) & {
  // The id of the group that holds the node.
  parent?: string
  // The column of a node without a group.
  partition?: number
  // Outside the open Concept of a Concept Map.
  outside: boolean
}

// All the Joints between two nodes.
export type MapLine = {
  id: string
  from: string
  to: string
  count: number
  // The worst Trust of the needed Parts.
  trust: Trust
  // Each Joint crosses a Project edge.
  dashed: boolean
  // The line goes from a later column to an earlier one.
  flipped: boolean
}

export type MapView = { nodes: Array<MapNode>; lines: Array<MapLine> }

const worstFirst = ['wrong', 'not-ready', 'flagged', 'solid'] as const

// The Map of a Project when the focus is its root: each top-level Concept
// is one closed node, in a column of its own. The Map of a Concept else:
// the Concept is open in the middle column, each outside top-level Concept
// glued to it is a closed node in the column before or after. A Concept of
// `expanded` is open when it has no group. An open Concept shows its sub
// Concepts, or its Parts when it has none. `parts` are the Parts of the lens.
export function toMapView({
  tree,
  parts,
  joints,
  focus,
  expanded,
}: {
  // The root Concept of the Project.
  tree: MapConcept
  parts: ReadonlyArray<MapPart>
  joints: ReadonlyArray<MapJoint>
  // The slug of the Concept of the Map.
  focus: string
  expanded: ReadonlyArray<string>
}): MapView {
  const concepts = new Map<string, MapConcept>()
  const parents = new Map<string, string>()
  function index(concept: MapConcept) {
    concepts.set(concept.slug, concept)
    for (const child of concept.concepts) {
      parents.set(child.slug, concept.slug)
      index(child)
    }
  }
  index(tree)

  // The Concept and the Concepts that hold it, root first.
  function listPath(slug: string): Array<string> {
    const path = []
    for (let at: string | undefined = slug; at; at = parents.get(at)) {
      path.unshift(at)
    }
    return path
  }

  const isProjectMap = focus === tree.slug || !concepts.has(focus)
  const isInFocus = (slug: string) =>
    !isProjectMap && listPath(slug).includes(focus)
  const partsById = new Map(parts.map((part) => [part.id, part]))
  const tops = [tree, ...tree.concepts]

  type End = MapPart | NonNullable<MapJoint['reference']>
  const findEnd = (joint: MapJoint, end: 'part' | 'needs'): End | undefined =>
    joint.reference?.end === end ? joint.reference : partsById.get(joint[end])
  const isOutside = (end: End): end is MapPart =>
    'concept' in end && !isInFocus(end.concept)

  const shown = joints.flatMap((joint) => {
    const part = findEnd(joint, 'part')
    const needs = findEnd(joint, 'needs')
    if (!part || !needs) return []
    const touchesFocus = [part, needs].some(
      (end) => 'concept' in end && isInFocus(end.concept),
    )
    return isProjectMap || touchesFocus ? [{ joint, part, needs }] : []
  })
  const ends = shown.flatMap(({ part, needs }) => [part, needs])

  // What a Joint glues to the open Concept from outside.
  const gluedParts = new Set(ends.filter(isOutside).map(({ id }) => id))
  const gluedConcepts = new Set(
    ends.filter(isOutside).flatMap(({ concept }) => listPath(concept)),
  )

  const nodes: Array<MapNode> = []
  // What each open Concept shows.
  const contents = new Map<string, 'concepts' | 'parts'>()

  function addConcept(
    concept: MapConcept,
    place: { parent?: string; partition?: number; outside: boolean },
  ) {
    const { slug, title } = concept
    const id = `concept:${slug}`
    const isFocus = !isProjectMap && slug === focus
    // The root stands for its own Parts: its Concepts are the other nodes.
    const inside =
      concept === tree
        ? []
        : concept.concepts.filter(
            (child) => !place.outside || gluedConcepts.has(child.slug),
          )
    const own = parts.filter(
      (part) =>
        part.concept === slug && (!place.outside || gluedParts.has(part.id)),
    )
    // A node cannot open around the open Concept.
    const holdsFocus =
      !isFocus && concept !== tree && listPath(focus).includes(slug)
    // Only a node without a group opens in place.
    const expandable =
      !isFocus &&
      !holdsFocus &&
      place.parent === undefined &&
      inside.length + own.length > 0
    const open = isFocus || (expandable && expanded.includes(slug))
    nodes.push({
      kind: 'concept',
      id,
      slug,
      title,
      count: parts.filter(
        (part) =>
          part.concept === slug ||
          (concept !== tree && listPath(part.concept).includes(slug)),
      ).length,
      open,
      expandable,
      ...place,
    })
    if (!open) return
    contents.set(slug, inside.length > 0 ? 'concepts' : 'parts')
    for (const child of inside) {
      addConcept(child, { parent: id, outside: place.outside })
    }
    if (inside.length > 0) return
    for (const part of own) {
      nodes.push({
        kind: 'part',
        id: `part:${part.id}`,
        part,
        parent: id,
        outside: place.outside,
      })
    }
  }

  const hasOwnParts = parts.some((part) => part.concept === tree.slug)
  if (isProjectMap) {
    tops.forEach((concept, rank) => {
      if (concept !== tree || hasOwnParts) {
        addConcept(concept, { partition: rank, outside: false })
      }
    })
  } else {
    const focusRank = tops.findIndex(
      ({ slug }) => slug === (listPath(focus).at(1) ?? focus),
    )
    tops.forEach((concept, rank) => {
      const open = concepts.get(focus)
      if (rank === focusRank && open) {
        addConcept(open, { partition: 1, outside: false })
      }
      if (concept.slug === focus) return
      const isGlued =
        concept === tree
          ? parts.some(
              (part) => part.concept === tree.slug && gluedParts.has(part.id),
            )
          : gluedConcepts.has(concept.slug)
      if (isGlued) {
        addConcept(concept, {
          partition: Math.sign(rank - focusRank) + 1,
          outside: true,
        })
      }
    })
  }
  for (const end of ends) {
    const id = `project:${'concept' in end ? '' : end.slug}`
    if ('concept' in end || nodes.some((node) => node.id === id)) continue
    nodes.push({
      kind: 'project',
      id,
      slug: end.slug,
      title: end.name,
      partition: isProjectMap ? tops.length : 2,
      outside: true,
    })
  }

  // The node that stands for an end of a Joint.
  function see(end: End): string {
    if (!('concept' in end)) return `project:${end.slug}`
    const path = listPath(end.concept)
    let at = isInFocus(end.concept)
      ? path.indexOf(focus)
      : Math.min(1, path.length - 1)
    while (contents.get(path[at]) === 'concepts' && at < path.length - 1) {
      at += 1
    }
    return at === path.length - 1 && contents.get(path[at]) === 'parts'
      ? `part:${end.id}`
      : `concept:${path[at]}`
  }

  const groups = new Map(nodes.map(({ id, parent }) => [id, parent]))
  // The node and the groups that hold it, the outermost one last.
  function listGroups(id: string): Array<string> {
    const found = []
    for (let at: string | undefined = id; at; at = groups.get(at)) {
      found.push(at)
    }
    return found
  }
  const findPartition = (id: string) =>
    nodes.find((node) => node.id === listGroups(id).at(-1))?.partition ?? 0

  const bundles = new Map<
    string,
    { from: string; to: string; joints: Array<MapJoint> }
  >()
  for (const { joint, part, needs } of shown) {
    const [from, to] = [see(part), see(needs)]
    // A line between a group and a node inside it has no place to go.
    if (listGroups(from).includes(to) || listGroups(to).includes(from)) continue
    const id = `${from}>${to}`
    const bundle = bundles.get(id) ?? { from, to, joints: [] }
    bundle.joints.push(joint)
    bundles.set(id, bundle)
  }

  const lines = [...bundles].map(([id, bundle]) => ({
    id,
    from: bundle.from,
    to: bundle.to,
    count: bundle.joints.length,
    trust:
      worstFirst.find((trust) =>
        bundle.joints.some((joint) => joint.trust === trust),
      ) ?? 'solid',
    dashed: bundle.joints.every(({ reference }) => reference !== undefined),
    flipped: findPartition(bundle.from) > findPartition(bundle.to),
  }))

  return { nodes, lines }
}

// What stays at full strength while the pointer or the focus is on a node or
// on a line: the node with the nodes inside it, its lines and the nodes at
// their other ends, each with the groups that hold it. For a line: the line
// and its two ends.
export function listGlued(
  { nodes, lines }: MapView,
  id: string,
): { nodes: Array<string>; lines: Array<string> } {
  const groups = new Map(nodes.map((node) => [node.id, node.parent]))
  function listGroups(of: string): Array<string> {
    const found = []
    for (let at: string | undefined = of; at; at = groups.get(at)) {
      found.push(at)
    }
    return found
  }

  const line = lines.find((candidate) => candidate.id === id)
  const own = new Set(
    nodes
      .filter((node) => listGroups(node.id).includes(id))
      .map((node) => node.id),
  )
  const kept = line
    ? [line]
    : lines.filter(({ from, to }) => own.has(from) || own.has(to))
  const lit = new Set(
    [...own, ...kept.flatMap(({ from, to }) => [from, to])].flatMap(listGroups),
  )

  return {
    nodes: nodes.filter((node) => lit.has(node.id)).map((node) => node.id),
    lines: kept.map((keptLine) => keptLine.id),
  }
}
