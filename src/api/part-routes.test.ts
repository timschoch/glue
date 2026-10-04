import { describe, expect, it } from 'vitest'

import { toProjectParams } from './part-routes.ts'

describe('toProjectParams', () => {
  it('reads the Project of a projects path', () => {
    expect(toProjectParams({ project: 'glue', recordId: 'G1' })).toEqual({
      project: 'glue',
      recordId: 'G1',
    })
  })

  it('reads the Project of a deprecated products path', () => {
    expect(toProjectParams({ product: 'glue' })).toEqual({ project: 'glue' })
  })
})
