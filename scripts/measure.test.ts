import { describe, expect, it } from 'vitest'

import { parseMeasureArgs } from './measure.ts'

describe('parseMeasureArgs', () => {
  it('measures every Product and writes by default', () => {
    expect(parseMeasureArgs([])).toEqual({ dryRun: false })
  })

  it('parses --product and --dry-run', () => {
    expect(parseMeasureArgs(['--product', 'flexibeck', '--dry-run'])).toEqual({
      productSlug: 'flexibeck',
      dryRun: true,
    })
  })

  it('rejects an unknown flag', () => {
    expect(() => parseMeasureArgs(['--products', 'glue'])).toThrow(
      /unknown flag "--products"/,
    )
  })

  it('rejects --product without a value', () => {
    expect(() => parseMeasureArgs(['--product'])).toThrow(
      /"--product" needs a value/,
    )
  })
})
