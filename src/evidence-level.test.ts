import { describe, expect, it } from 'vitest'

import { canRaiseToPattern } from './evidence-level.ts'

const github = (date: string) => ({ source: 'github', date })

describe('the Signals that make a Hunch a Pattern', () => {
  it('takes Signals of two sources', () => {
    expect(
      canRaiseToPattern([
        github('2026-10-02'),
        { source: 'support', date: '2026-10-02' },
      ]),
    ).toBe(true)
  })

  it('takes Signals of one source on three days that are seven days apart', () => {
    expect(
      canRaiseToPattern([
        github('2026-10-01'),
        github('2026-10-04'),
        github('2026-10-08'),
      ]),
    ).toBe(true)
  })

  it('refuses Signals of one source on three days that are six days apart', () => {
    expect(
      canRaiseToPattern([
        github('2026-10-01'),
        github('2026-10-04'),
        github('2026-10-07'),
      ]),
    ).toBe(false)
  })

  it('refuses Signals of one source on two days', () => {
    expect(
      canRaiseToPattern([
        github('2026-09-01'),
        github('2026-10-08'),
        github('2026-10-08'),
      ]),
    ).toBe(false)
  })

  it('refuses no Signals', () => {
    expect(canRaiseToPattern([])).toBe(false)
  })
})
