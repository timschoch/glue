import { describe, expect, it } from 'vitest'

import { listGlued, toMapView } from './concept-map-layout.ts'
import type { MapJoint, MapPart, MapView } from './concept-map-layout.ts'

const leaf = (slug: string, title: string) => ({ slug, title, concepts: [] })

// The Project Glue: its root has one Part of its own and three Concepts.
const TREE = {
  slug: 'glue',
  title: 'Glue',
  concepts: [
    {
      slug: 'concept',
      title: 'Concept',
      concepts: [
        leaf('part-model', 'Part model'),
        leaf('read-model', 'Read model'),
        leaf('drafts', 'Drafts'),
      ],
    },
    {
      slug: 'build-run',
      title: 'Build run',
      concepts: [leaf('merge-gate', 'Merge gate'), leaf('verify', 'Verify')],
    },
    leaf('people', 'People'),
  ],
}

function part(
  id: string,
  type: MapPart['type'],
  concept: string,
  trust: MapPart['trust'] = 'solid',
): MapPart {
  return { id, type, title: `Title of ${id}`, trust, concept }
}

const PARTS = [
  part('G1', 'goal', 'glue'),
  part('E1', 'entity', 'part-model'),
  part('E2', 'entity', 'read-model', 'flagged'),
  part('E3', 'entity', 'drafts'),
  part('D1', 'decision', 'merge-gate'),
  part('D2', 'decision', 'merge-gate'),
  part('R1', 'guardrail', 'verify', 'not-ready'),
  part('D3', 'decision', 'people', 'wrong'),
  part('D4', 'decision', 'people'),
]

// Each Joint has the Trust of the Part that it needs.
const JOINTS: Array<MapJoint> = [
  { id: 1, part: 'D1', needs: 'E1', trust: 'solid' },
  { id: 2, part: 'D2', needs: 'E2', trust: 'flagged' },
  { id: 3, part: 'R1', needs: 'E1', trust: 'solid' },
  { id: 4, part: 'D3', needs: 'D1', trust: 'solid' },
  { id: 5, part: 'D1', needs: 'G1', trust: 'solid' },
  { id: 6, part: 'D4', needs: 'D3', trust: 'wrong' },
  {
    id: 7,
    part: 'D3',
    // The record id of a Part of another Project.
    needs: 'D1',
    trust: 'solid',
    reference: { end: 'needs', slug: 'flexibeck', name: 'Flexibeck' },
  },
  { id: 8, part: 'D1', needs: 'D2', trust: 'solid' },
]

function view(focus: string, expanded: Array<string> = [], parts = PARTS) {
  return toMapView({ tree: TREE, parts, joints: JOINTS, focus, expanded })
}

// The top-level nodes with their columns.
function columns({ nodes }: MapView) {
  return nodes
    .filter(({ parent }) => parent === undefined)
    .map(({ id, partition }) => [id, partition])
}

// The nodes inside a group.
function inside({ nodes }: MapView, group: string) {
  return nodes.filter(({ parent }) => parent === group).map(({ id }) => id)
}

function line(map: MapView, id: string) {
  return map.lines.find((candidate) => candidate.id === id)
}

describe('toMapView, the Map of a Project', () => {
  it('has one closed node per top-level Concept, in the order of the Concepts', () => {
    const map = view('glue')

    expect(columns(map)).toEqual([
      ['concept:glue', 0],
      ['concept:concept', 1],
      ['concept:build-run', 2],
      ['concept:people', 3],
      ['project:flexibeck', 4],
    ])
    expect(
      map.nodes.map((node) => node.kind === 'concept' && node.open),
    ).toEqual([false, false, false, false, false])
  })

  it('has no node for a root without a Part of its own', () => {
    const map = view(
      'glue',
      [],
      PARTS.filter(({ id }) => id !== 'G1'),
    )

    expect(columns(map)[0]).toEqual(['concept:concept', 1])
  })

  it('counts the Parts of a Concept and of the Concepts in it', () => {
    const counts = view('glue').nodes.map(
      (node) => node.kind === 'concept' && node.count,
    )

    expect(counts).toEqual([1, 3, 3, 2, false])
  })

  it('bundles the Joints between two nodes into one line with their count', () => {
    const map = view('glue')

    expect(map.lines.map(({ id, count }) => [id, count])).toEqual([
      ['concept:build-run>concept:concept', 3],
      ['concept:people>concept:build-run', 1],
      ['concept:build-run>concept:glue', 1],
      ['concept:people>project:flexibeck', 1],
    ])
  })

  it('gives a bundle the worst Trust of the Parts that it needs', () => {
    const map = view('glue')

    expect(line(map, 'concept:build-run>concept:concept')?.trust).toBe(
      'flagged',
    )
    expect(line(map, 'concept:people>concept:build-run')?.trust).toBe('solid')
  })

  it('dashes a line when each of its Joints crosses a Project edge', () => {
    const map = view('glue')

    expect(map.lines.map(({ dashed }) => dashed)).toEqual([
      false,
      false,
      false,
      true,
    ])
  })

  it('flips a line that goes from a later column to an earlier one', () => {
    const map = view('glue')

    expect(map.lines.map(({ flipped }) => flipped)).toEqual([
      true,
      true,
      true,
      false,
    ])
  })

  it('opens an expanded Concept to its sub Concepts', () => {
    const map = view('glue', ['build-run'])

    expect(inside(map, 'concept:build-run')).toEqual([
      'concept:merge-gate',
      'concept:verify',
    ])
    expect(map.lines.map(({ id, count }) => [id, count])).toEqual([
      ['concept:merge-gate>concept:concept', 2],
      ['concept:verify>concept:concept', 1],
      ['concept:people>concept:merge-gate', 1],
      ['concept:merge-gate>concept:glue', 1],
      ['concept:people>project:flexibeck', 1],
    ])
  })

  it('opens an expanded Concept without a sub Concept to its Parts', () => {
    const map = view('glue', ['people'])

    expect(inside(map, 'concept:people')).toEqual(['part:D3', 'part:D4'])
    expect(line(map, 'part:D4>part:D3')).toEqual({
      id: 'part:D4>part:D3',
      from: 'part:D4',
      to: 'part:D3',
      count: 1,
      trust: 'wrong',
      dashed: false,
      flipped: false,
    })
    expect(line(map, 'part:D3>concept:build-run')?.flipped).toBe(true)
  })

  it('keeps a sub Concept inside an open Concept closed', () => {
    const map = view('glue', ['build-run', 'merge-gate'])

    expect(inside(map, 'concept:merge-gate')).toEqual([])
  })

  it('reads no Joint to a Part that the lens hides', () => {
    const map = view(
      'glue',
      [],
      PARTS.filter(({ type }) => type === 'decision'),
    )

    expect(map.lines.map(({ id }) => id)).toEqual([
      'concept:people>concept:build-run',
      'concept:people>project:flexibeck',
    ])
  })
})

describe('toMapView, the Map of a Concept', () => {
  it('has the Concept open in the middle, the Concepts before it on the left and the ones after it on the right', () => {
    const map = view('build-run')

    expect(columns(map)).toEqual([
      ['concept:glue', 0],
      ['concept:concept', 0],
      ['concept:build-run', 1],
      ['concept:people', 2],
    ])
    expect(inside(map, 'concept:build-run')).toEqual([
      'concept:merge-gate',
      'concept:verify',
    ])
  })

  it('shows each outside Concept as a closed grey node', () => {
    const states = view('build-run').nodes.map(
      (node) => node.kind === 'concept' && [node.slug, node.open, node.outside],
    )

    expect(states).toEqual([
      ['glue', false, true],
      ['concept', false, true],
      ['build-run', true, false],
      ['merge-gate', false, false],
      ['verify', false, false],
      ['people', false, true],
    ])
  })

  it('shows only the Joints that touch the Concept', () => {
    const map = view('build-run')

    expect(map.lines.map(({ id, count }) => [id, count])).toEqual([
      ['concept:merge-gate>concept:concept', 2],
      ['concept:verify>concept:concept', 1],
      ['concept:people>concept:merge-gate', 1],
      ['concept:merge-gate>concept:glue', 1],
    ])
  })

  it('leaves out a Concept that no Joint glues to it', () => {
    const map = view('people')

    expect(columns(map)).toEqual([
      ['concept:build-run', 0],
      ['concept:people', 1],
      ['project:flexibeck', 2],
    ])
  })

  it('opens an outside Concept to the Concepts that are glued', () => {
    const map = view('build-run', ['concept'])

    expect(inside(map, 'concept:concept')).toEqual([
      'concept:part-model',
      'concept:read-model',
    ])
  })

  it('opens an outside Concept without a sub Concept to the Parts that are glued', () => {
    const map = view('build-run', ['people'])

    expect(inside(map, 'concept:people')).toEqual(['part:D3'])
  })

  it('can open each top-level node with content, never the open Concept or a node inside a group', () => {
    const controls = view('build-run').nodes.map(
      (node) => node.kind === 'concept' && node.expandable,
    )

    expect(controls).toEqual([true, true, false, false, false, true])
  })
})

describe('listGlued', () => {
  it('lists a node, its lines and the nodes at their other ends', () => {
    const map = view('glue', ['build-run'])

    expect(listGlued(map, 'concept:verify')).toEqual({
      nodes: ['concept:concept', 'concept:build-run', 'concept:verify'],
      lines: ['concept:verify>concept:concept'],
    })
  })

  it('lists a line and the nodes at its two ends', () => {
    const map = view('glue')

    expect(listGlued(map, 'concept:people>project:flexibeck')).toEqual({
      nodes: ['concept:people', 'project:flexibeck'],
      lines: ['concept:people>project:flexibeck'],
    })
  })
})
