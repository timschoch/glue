import { describe, expect, it } from 'vitest'
import { createBot, createRandom, getTimezone } from './bot.ts'

describe('bot', () => {
  it('repeats exactly with the same seed', () => {
    expect(createBot(createRandom(7))).toEqual(createBot(createRandom(7)))
  })

  it('differs with another seed', () => {
    expect(createBot(createRandom(7))).not.toEqual(createBot(createRandom(8)))
  })

  it('draws traits in range', () => {
    const random = createRandom(1)
    for (let index = 0; index < 200; index++) {
      const bot = createBot(random)
      expect(bot.patience).toBeGreaterThanOrEqual(0)
      expect(bot.patience).toBeLessThan(1)
      expect(bot.experience).toBeGreaterThanOrEqual(0)
      expect(bot.experience).toBeLessThan(1)
      expect(['desktop', 'mobile']).toContain(bot.device)
      expect(Number.isInteger(bot.hour)).toBe(true)
      expect(bot.hour).toBeGreaterThanOrEqual(0)
      expect(bot.hour).toBeLessThan(24)
    }
  })

  it('picks a timezone where the local hour is the bot hour', () => {
    const now = new Date('2026-09-30T10:30:00Z')
    for (let hour = 0; hour < 24; hour++) {
      const localHour = new Intl.DateTimeFormat('en-GB', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone: getTimezone(hour, now),
      }).format(now)
      expect(Number(localHour)).toBe(hour)
    }
  })
})
