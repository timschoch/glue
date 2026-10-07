import { describe, expect, it } from 'vitest'

import {
  changePin,
  landingSection,
  lensTypes,
  openRecord,
  parseProjectSearch,
} from './project-search.ts'

describe('the search parameters of a Project', () => {
  it('reads the section, the pins and the trail from the address', () => {
    expect(
      parseProjectSearch({
        section: 'Decide',
        pins: ['D2', 'G1'],
        trail: ['I3', 'D1'],
      }),
    ).toEqual({ section: 'Decide', pins: ['D2', 'G1'], trail: ['I3', 'D1'] })
  })

  it('leaves out what the address does not have', () => {
    expect(parseProjectSearch({})).toEqual({})
    expect(parseProjectSearch({ pins: [], trail: [] })).toEqual({})
  })

  it.each([
    [{ section: 'decide' }],
    [{ section: 7 }],
    [{ pins: 'D2' }],
    [{ pins: ['nope', 7, null] }],
    [{ trail: { id: 'D2' } }],
    [{ issue: 'missing' }],
  ])('drops %o, which is no value of a parameter', (search) => {
    expect(parseProjectSearch(search)).toEqual({})
  })

  it.each([
    [{ add: 'decision' }],
    [{ add: 'concept' }],
    [{ add: 'project' }],
    [{ edit: true }],
  ])('reads the form %o from the address', (search) => {
    expect(parseProjectSearch(search)).toEqual(search)
  })

  it('reads the open areas of the Map, each one once', () => {
    expect(
      parseProjectSearch({ expanded: ['build-run', 'people', 'build-run'] }),
    ).toEqual({ expanded: ['build-run', 'people'] })
    expect(parseProjectSearch({ expanded: [] })).toEqual({})
    expect(parseProjectSearch({ expanded: ['Build run', 7] })).toEqual({})
  })

  it('reads the detail of a section', () => {
    expect(parseProjectSearch({ detail: true })).toEqual({ detail: true })
    expect(parseProjectSearch({ detail: 'yes' })).toEqual({})
  })

  it('reads the record or the Concept of the panel', () => {
    expect(parseProjectSearch({ panel: 'D12' })).toEqual({ panel: 'D12' })
    expect(parseProjectSearch({ panel: 'merge-gate' })).toEqual({
      panel: 'merge-gate',
    })
    expect(parseProjectSearch({ panel: 'Merge gate' })).toEqual({})
    expect(parseProjectSearch({ panel: 12 })).toEqual({})
  })

  it('reads the map view from the address, and drops another view', () => {
    expect(parseProjectSearch({ view: 'map' })).toEqual({ view: 'map' })
    expect(parseProjectSearch({ view: 'list' })).toEqual({})
  })

  it.each([[{ add: 'record' }], [{ add: true }], [{ edit: 'yes' }]])(
    'drops %o, which names no form',
    (search) => {
      expect(parseProjectSearch(search)).toEqual({})
    },
  )

  it('keeps a record once in the pins and once in the trail', () => {
    expect(
      parseProjectSearch({ pins: ['D2', 'D2', 'G1'], trail: ['I3', 'I3'] }),
    ).toEqual({ pins: ['D2', 'G1'], trail: ['I3'] })
  })
})

describe('the trail', () => {
  it('starts when a record opens from a Concept', () => {
    expect(openRecord({}, undefined, 'D2')).toEqual({})
  })

  it('gets the open record when the next record opens', () => {
    expect(openRecord({}, 'D2', 'I3')).toEqual({ trail: ['D2'] })
    expect(openRecord({ trail: ['D2'] }, 'I3', 'G1')).toEqual({
      trail: ['D2', 'I3'],
    })
  })

  it('goes back to a record of the trail and drops the records after it', () => {
    const search = { trail: ['D2', 'I3'] }

    expect(openRecord(search, 'G1', 'I3')).toEqual({ trail: ['D2'] })
    expect(openRecord(search, 'G1', 'D2')).toEqual({})
  })

  it('stays as it is when the open record opens again', () => {
    expect(openRecord({ trail: ['D2'] }, 'I3', 'I3')).toEqual({
      trail: ['D2'],
    })
  })

  it('keeps the section and the pins', () => {
    expect(openRecord({ section: 'Decide', pins: ['G1'] }, 'D2', 'I3')).toEqual(
      { section: 'Decide', pins: ['G1'], trail: ['D2'] },
    )
  })
})

describe('the pins', () => {
  it('puts the newest pin first', () => {
    expect(changePin({ pins: ['D2'] }, 'G1', true)).toEqual({
      pins: ['G1', 'D2'],
    })
  })

  it('holds a record once', () => {
    expect(changePin({ pins: ['G1', 'D2'] }, 'D2', true)).toEqual({
      pins: ['D2', 'G1'],
    })
  })

  it('removes a pin, and the parameter with the last pin', () => {
    expect(changePin({ pins: ['G1', 'D2'] }, 'G1', false)).toEqual({
      pins: ['D2'],
    })
    expect(changePin({ pins: ['D2'], trail: ['I3'] }, 'D2', false)).toEqual({
      trail: ['I3'],
    })
  })
})

describe('the lens of a section', () => {
  it('shows all Part types without a section', () => {
    expect(lensTypes(undefined)).toBeUndefined()
  })

  it('shows the Part types that the concept names for the loop step', () => {
    expect(lensTypes('Understand')).toEqual(['insight'])
    expect(lensTypes('Decide')).toEqual([
      'goal',
      'decision',
      'guardrail',
      'flow',
      'metric',
    ])
    expect(lensTypes('Design')).toEqual(['guardrail', 'entity', 'flow'])
    expect(lensTypes('Build')).toEqual(['guardrail', 'entity'])
    expect(lensTypes('Use')).toEqual(['metric'])
  })

  it.each(['Mine', 'People'] as const)('shows no Part in %s', (section) => {
    expect(lensTypes(section)).toEqual([])
  })
})

describe('the section after sign-in', () => {
  it('is Mine for a member with open items', () => {
    expect(landingSection(2, ['build', 'use'])).toBe('Mine')
  })

  it('is the first loop step of a member with no open item', () => {
    expect(landingSection(0, ['build', 'use'])).toBe('Build')
  })

  it('is no section for a member with no loop step', () => {
    expect(landingSection(0, [])).toBeUndefined()
  })
})
