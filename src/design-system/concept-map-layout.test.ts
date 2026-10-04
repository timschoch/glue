import { describe, expect, it } from 'vitest'

import { layoutLayers, layoutMap } from './concept-map-layout.ts'

const GOAL = { id: 'G1', rank: 0 }
const INSIGHT = { id: 'I1', rank: 0 }
const DECISION = { id: 'D1', rank: 1 }
const FLOW = { id: 'F1', rank: 2 }
const ENTITY = { id: 'E1', rank: 2 }
const GUARDRAIL = { id: 'R1', rank: 3 }

let lastJointId = 0

function joint(part: string, needs: string, twoWay = false) {
  lastJointId += 1
  return { id: lastJointId, part, needs, twoWay }
}

describe('layoutLayers', () => {
  it('puts each node in the layer of its rank, without an empty layer', () => {
    expect(layoutLayers([GOAL, INSIGHT, FLOW], [])).toEqual([
      ['G1', 'I1'],
      ['F1'],
    ])
  })

  it('puts a node below each node that it needs', () => {
    const layers = layoutLayers(
      [GOAL, INSIGHT, DECISION, GUARDRAIL],
      [joint('D1', 'G1'), joint('D1', 'R1')],
    )

    expect(layers).toEqual([['G1', 'I1'], ['R1'], ['D1']])
  })

  it('moves a chain down one layer per Joint', () => {
    const layers = layoutLayers(
      [GOAL, { id: 'G2', rank: 0 }, { id: 'G3', rank: 0 }],
      [joint('G2', 'G1'), joint('G3', 'G2')],
    )

    expect(layers).toEqual([['G1'], ['G2'], ['G3']])
  })

  it('keeps the two nodes of a two-way Joint in the layers of their ranks', () => {
    expect(layoutLayers([FLOW, ENTITY], [joint('F1', 'E1', true)])).toEqual([
      ['F1', 'E1'],
    ])
  })

  it('ends on Joints that go in a circle', () => {
    const layers = layoutLayers(
      [FLOW, ENTITY],
      [joint('F1', 'E1'), joint('E1', 'F1')],
    )

    expect(layers.flat().sort()).toEqual(['E1', 'F1'])
  })

  it('reads no Joint with an end that is no node', () => {
    expect(layoutLayers([DECISION], [joint('D1', 'G9')])).toEqual([['D1']])
  })

  it('orders a layer by the places of the nodes that its nodes need', () => {
    const layers = layoutLayers(
      [GOAL, INSIGHT, DECISION, { id: 'D2', rank: 1 }],
      [joint('D1', 'I1'), joint('D2', 'G1')],
    )

    expect(layers).toEqual([
      ['G1', 'I1'],
      ['D2', 'D1'],
    ])
  })
})

describe('layoutMap', () => {
  it('places the layers from top to bottom, each one in the middle', () => {
    const map = layoutMap([['G1', 'I1'], ['D1']], [])

    expect(map.width).toBe(27)
    expect(map.height).toBe(19)
    expect(map.places).toEqual({
      G1: { left: 0, top: 0 },
      I1: { left: 14, top: 0 },
      D1: { left: 7, top: 11 },
    })
  })

  it('draws a Joint from the lower edge of the upper node to the upper edge of the lower node', () => {
    const needed = joint('D1', 'G1')
    const map = layoutMap([['G1'], ['D1']], [needed])

    expect(map.lines).toEqual([
      { id: needed.id, path: 'M 6.5 8 C 6.5 9.5, 6.5 9.5, 6.5 11' },
    ])
  })

  it('draws a Joint in one layer from side to side', () => {
    const both = joint('F1', 'E1', true)
    const map = layoutMap([['F1', 'E1']], [both])

    expect(map.lines).toEqual([{ id: both.id, path: 'M 13 4 L 14 4' }])
  })

  it('draws no Joint with an end that has no place', () => {
    expect(layoutMap([['D1']], [joint('D1', 'G9')]).lines).toEqual([])
  })

  it('has no size without a node', () => {
    expect(layoutMap([], [])).toEqual({
      width: 0,
      height: 0,
      places: {},
      lines: [],
    })
  })
})
