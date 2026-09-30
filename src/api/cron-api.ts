// Vercel Cron calls these routes with `Authorization: Bearer <CRON_SECRET>`.
// See vercel.json for the schedule.
import { createHash, timingSafeEqual } from 'node:crypto'

import type { measureGoals } from '../measure/measure-goals.ts'

function hashText(value: string) {
  return createHash('sha256').update(value).digest()
}

// Compares in constant time, so the answer time does not leak the secret.
// Without a secret no request passes.
function isCronRequest(request: Request, cronSecret: string | undefined) {
  if (!cronSecret) return false
  const authorization = request.headers.get('authorization') ?? ''
  return timingSafeEqual(
    hashText(authorization),
    hashText(`Bearer ${cronSecret}`),
  )
}

// The daily measure run over the Goals of every Product. `measure` runs only
// after the secret matched, so an unauthorized call reads no other setting.
export async function handleMeasureCron(input: {
  request: Request
  cronSecret: string | undefined
  measure: () => ReturnType<typeof measureGoals>
}) {
  const { request, cronSecret, measure } = input
  if (!isCronRequest(request, cronSecret)) {
    return Response.json(
      { error: { code: 'unauthorized', message: 'send the cron secret' } },
      { status: 401 },
    )
  }
  return Response.json(await measure())
}
