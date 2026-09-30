export type Random = () => number

export type Device = 'desktop' | 'mobile'

export type Bot = {
  /** 0 impatient to 1 patient. */
  patience: number
  /** Experience with sourdough, 0 novice to 1 expert. */
  experience: number
  device: Device
  /** Local hour of the visit, 0 to 23. */
  hour: number
}

export const VIEWPORTS: Record<Device, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
}

const HOURS_PER_DAY = 24
const HALF_DAY = 12
const MOBILE_SHARE = 0.5

/** Mulberry32: a small, fast PRNG. The same seed gives the same sequence. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32
  }
}

/**
 * A fixed-offset IANA zone where the local hour at `now` is `hour`, so the product
 * sees the bot visit at its time of day. Etc/GMT zones invert the sign: UTC+3 is
 * Etc/GMT-3.
 */
export function getTimezone(hour: number, now: Date): string {
  const offset =
    ((((hour - now.getUTCHours()) % HOURS_PER_DAY) + HOURS_PER_DAY + HALF_DAY) %
      HOURS_PER_DAY) -
    HALF_DAY
  if (offset === 0) return 'Etc/GMT'
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`
}

export function createBot(random: Random): Bot {
  return {
    patience: random(),
    experience: random(),
    device: random() < MOBILE_SHARE ? 'mobile' : 'desktop',
    hour: Math.floor(random() * HOURS_PER_DAY),
  }
}
