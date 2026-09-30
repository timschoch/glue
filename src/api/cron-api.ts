// Vercel Cron calls these routes with `Authorization: Bearer <CRON_SECRET>`.
// See vercel.json for the schedule.
import { createHash, timingSafeEqual } from 'node:crypto'

import type { ConceptDb } from '../db/client.ts'
import { measureGoals } from '../measure/measure-goals.ts'
import type { MetricSource } from '../measure/metric-source.ts'

function hashText(value: string) {
  return createHash('sha256').update(value).digest()
}

// Compares in constant time, so the answer time does not leak the secret.
function isCronRequest(request: Request, cronSecret: string) {
  const authorization = request.headers.get('authorization') ?? ''
  return timingSafeEqual(
    hashText(authorization),
    hashText(`Bearer ${cronSecret}`),
  )
}

// The daily measure run over the Goals of every Product.
export async function handleMeasureCron(input: {
  db: ConceptDb
  request: Request
  source: MetricSource
  cronSecret: string
}) {
  const { db, request, source, cronSecret } = input
  if (!isCronRequest(request, cronSecret)) {
    return Response.json(
      { error: { code: 'unauthorized', message: 'send the cron secret' } },
      { status: 401 },
    )
  }
  const insights = await measureGoals({ db, source, now: new Date() })
  return Response.json({ insights })
}
