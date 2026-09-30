/** Hosts on the developer's own machine. Every other host is a live product. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])
const LIVE_MAX_USERS = 50
const LIVE_MAX_CONCURRENCY = 2
const LIVE_START_GAP_MS = 2_000

/** How hard a run loads the product. */
export type Traffic = {
  users: number
  concurrency: number
  /** The least time between the starts of two bots. */
  startGapMs: number
  /** One line per cap that applies. */
  caps: Array<string>
}

/** Caps the load of a run on a live product, so the product stays up for real people. */
export function getTraffic(
  target: string,
  users: number,
  concurrency: number,
): Traffic {
  if (LOCAL_HOSTS.has(new URL(target).hostname)) {
    return {
      users,
      concurrency: Math.min(concurrency, users),
      startGapMs: 0,
      caps: [],
    }
  }
  const caps: Array<string> = []
  if (users > LIVE_MAX_USERS) {
    caps.push(`users ${users} → ${LIVE_MAX_USERS} on a live target`)
  }
  if (concurrency > LIVE_MAX_CONCURRENCY) {
    caps.push(
      `concurrency ${concurrency} → ${LIVE_MAX_CONCURRENCY} on a live target`,
    )
  }
  const cappedUsers = Math.min(users, LIVE_MAX_USERS)
  return {
    users: cappedUsers,
    concurrency: Math.min(concurrency, LIVE_MAX_CONCURRENCY, cappedUsers),
    startGapMs: LIVE_START_GAP_MS,
    caps,
  }
}
