import { describe, expect, it } from 'vitest'
import { getTraffic } from './traffic.ts'

describe('getTraffic', () => {
  it('leaves a local target as asked', () => {
    for (const target of ['http://localhost:3000/', 'http://127.0.0.1:8080/']) {
      expect(getTraffic(target, 200, 8)).toEqual({
        users: 200,
        concurrency: 8,
        startGapMs: 0,
        caps: [],
      })
    }
  })

  it('caps users and concurrency on a live target and names each cap', () => {
    const traffic = getTraffic('https://flexibeck.example/', 200, 8)
    expect(traffic).toMatchObject({
      users: 50,
      concurrency: 2,
      startGapMs: 2_000,
    })
    expect(traffic.caps).toHaveLength(2)
    expect(traffic.caps.join('\n')).toMatch(/users 200 → 50/)
    expect(traffic.caps.join('\n')).toMatch(/concurrency 8 → 2/)
  })

  it('names no cap when a live run stays below them', () => {
    expect(getTraffic('https://flexibeck.example/', 10, 1)).toEqual({
      users: 10,
      concurrency: 1,
      startGapMs: 2_000,
      caps: [],
    })
  })

  it('never runs more bots at once than there are users', () => {
    expect(getTraffic('http://localhost:3000/', 3, 8).concurrency).toBe(3)
  })
})
