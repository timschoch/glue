import { describe, expect, it } from 'vitest'

import { toProjectParams } from './concept-routes.ts'

describe('toProjectParams', () => {
  it('reads the Project of a projects path', () => {
    expect(
      toProjectParams({ project: 'glue', folder: 'goals', recordId: 'G1' }),
    ).toEqual({ project: 'glue', folder: 'goals', recordId: 'G1' })
  })

  it('reads the Project of a deprecated products path', () => {
    expect(toProjectParams({ product: 'glue', folder: 'goals' })).toEqual({
      project: 'glue',
      folder: 'goals',
    })
  })
})
