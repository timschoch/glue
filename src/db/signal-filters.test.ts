import { describe, expect, it } from 'vitest'

import { addProject } from './part-records.ts'
import {
  InvalidRecordError,
  SignalFilterNotFoundError,
} from './record-errors.ts'
import * as schema from './schema.ts'
import {
  addSignalFilter,
  listSignalFilters,
  removeSignalFilter,
  updateSignalFilter,
} from './signal-filters.ts'
import { listSignals } from './signals.ts'
import type { SignalSource } from './signals.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

const slowLists = {
  name: 'Slow lists',
  mustHold: ['slow'],
  mustNotHold: ['phone'],
  sources: ['github', 'support'],
}

describe('addSignalFilter', () => {
  it('saves the filter for the Project, and lists the filters by name', async () => {
    await addProject(db, 'glue')
    await addProject(db, 'flexibeck')

    const added = await addSignalFilter(db, 'glue', slowLists)
    await addSignalFilter(db, 'glue', { name: 'Market', sources: ['market'] })
    await addSignalFilter(db, 'flexibeck', { name: 'Other', mustHold: ['x'] })

    expect(added).toEqual({ id: 1, ...slowLists })
    expect(await listSignalFilters(db, 'glue')).toEqual([
      {
        id: 2,
        name: 'Market',
        mustHold: [],
        mustNotHold: [],
        sources: ['market'],
      },
      { id: 1, ...slowLists },
    ])
  })

  it('takes the words without the space around them', async () => {
    await addProject(db, 'glue')

    const added = await addSignalFilter(db, 'glue', {
      name: ' Slow lists ',
      mustHold: [' slow '],
    })

    expect(added).toEqual({
      id: 1,
      name: 'Slow lists',
      mustHold: ['slow'],
      mustNotHold: [],
      sources: [],
    })
  })

  it.each([
    { filter: { name: ' ', mustHold: ['slow'] }, reason: 'name' },
    { filter: { name: 'Slow lists', mustHold: [' '] }, reason: 'mustHold' },
    { filter: { name: 'All' }, reason: 'A filter needs a word or a source' },
  ])('refuses a filter with no $reason', async ({ filter, reason }) => {
    await addProject(db, 'glue')

    const refused = addSignalFilter(db, 'glue', filter)

    await expect(refused).rejects.toThrow(InvalidRecordError)
    await expect(refused).rejects.toThrow(reason)
    expect(await listSignalFilters(db, 'glue')).toEqual([])
  })

  it('refuses a second filter with the name of a filter of the Project', async () => {
    await addProject(db, 'glue')
    await addSignalFilter(db, 'glue', slowLists)

    await expect(
      addSignalFilter(db, 'glue', { name: 'Slow lists', mustHold: ['list'] }),
    ).rejects.toThrow(
      new InvalidRecordError('"Slow lists" is a filter already'),
    )
  })
})

describe('updateSignalFilter', () => {
  it('changes the filter', async () => {
    await addProject(db, 'glue')
    await addSignalFilter(db, 'glue', slowLists)

    const changed = await updateSignalFilter(db, 'glue', 1, {
      name: 'Slow',
      mustHold: ['slow', 'wait'],
    })

    const expected = {
      id: 1,
      name: 'Slow',
      mustHold: ['slow', 'wait'],
      mustNotHold: [],
      sources: [],
    }
    expect(changed).toEqual(expected)
    expect(await listSignalFilters(db, 'glue')).toEqual([expected])
  })

  it('refuses a filter that the Project does not have', async () => {
    await addProject(db, 'glue')
    await addProject(db, 'flexibeck')
    await addSignalFilter(db, 'flexibeck', slowLists)

    await expect(
      updateSignalFilter(db, 'glue', 1, { name: 'Mine', mustHold: ['x'] }),
    ).rejects.toThrow(new SignalFilterNotFoundError(1))
    expect(await listSignalFilters(db, 'flexibeck')).toEqual([
      { id: 1, ...slowLists },
    ])
  })
})

describe('removeSignalFilter', () => {
  it('deletes the filter of the Project', async () => {
    await addProject(db, 'glue')
    await addSignalFilter(db, 'glue', slowLists)

    await removeSignalFilter(db, 'glue', 1)

    expect(await listSignalFilters(db, 'glue')).toEqual([])
  })

  it('refuses a filter that the Project does not have', async () => {
    await addProject(db, 'glue')
    await addProject(db, 'flexibeck')
    await addSignalFilter(db, 'flexibeck', slowLists)

    await expect(removeSignalFilter(db, 'glue', 1)).rejects.toThrow(
      new SignalFilterNotFoundError(1),
    )
    expect(await listSignalFilters(db, 'flexibeck')).toHaveLength(1)
  })
})

describe('listSignals with a saved filter', () => {
  const sources: SignalSource[] = [
    {
      name: 'github',
      listSignals: async () => [
        {
          url: 'https://github.com/timschoch/glue/issues/7',
          title: 'The list is slow',
          text: '',
          date: '2026-10-02',
        },
        {
          url: 'https://github.com/timschoch/glue/issues/8',
          title: 'The list is slow on my phone',
          text: '',
          date: '2026-10-01',
        },
      ],
    },
    {
      name: 'social',
      listSignals: async () => [
        {
          url: 'https://social.test/comments/1',
          title: 'Comment of ada',
          titleBy: 'glue',
          text: 'The list is slow',
          date: '2026-10-03',
        },
      ],
    },
  ]

  it('lists the Signals that pass the filter, and their groups', async () => {
    await addProject(db, 'glue')
    await addSignalFilter(db, 'glue', slowLists)

    const found = await listSignals(db, sources, 'glue', { filter: 1 })

    expect(found).toEqual({
      failures: [],
      signals: [
        {
          url: 'https://github.com/timschoch/glue/issues/7',
          title: 'The list is slow',
          text: '',
          date: '2026-10-02',
          source: 'github',
          insight: null,
        },
      ],
      groups: [],
    })
  })

  it('refuses a filter that the Project does not have', async () => {
    await addProject(db, 'glue')

    await expect(
      listSignals(db, sources, 'glue', { filter: 1 }),
    ).rejects.toThrow(new SignalFilterNotFoundError(1))
  })
})
