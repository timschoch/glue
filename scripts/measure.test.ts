import { describe, expect, it } from 'vitest'

import { parseMeasureArgs } from './measure.ts'

describe('parseMeasureArgs', () => {
  it('measures every Product and writes by default', () => {
    expect(parseMeasureArgs([])).toEqual({ dryRun: false })
  })

  it('parses --project and --dry-run', () => {
    expect(parseMeasureArgs(['--project', 'flexibeck', '--dry-run'])).toEqual({
      productSlug: 'flexibeck',
      dryRun: true,
    })
  })

  it('rejects an unknown flag', () => {
    expect(() => parseMeasureArgs(['--products', 'glue'])).toThrow(
      /unknown flag "--products"/,
    )
  })

  it('rejects --project without a value', () => {
    expect(() => parseMeasureArgs(['--project'])).toThrow(
      /"--project" needs a value/,
    )
  })

  it('rejects the old --product and names --project', () => {
    expect(() => parseMeasureArgs(['--product', 'glue'])).toThrow(
      '"--product" is gone: use "--project"',
    )
  })
})
