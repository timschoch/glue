// The measure run of a Project over HTTP. The measure cron and the mocks
// call it.
import { z } from 'zod'

import {
  measureGoals,
  measuredInsightSchema,
  skippedGoalSchema,
} from '../measure/measure-goals.ts'
import type { MetricSource } from '../measure/metric-source.ts'
import { handleApiRequest } from './api-request.ts'
import type { ApiRequest } from './api-request.ts'

export const measureResultSchema = z
  .object({
    insights: z.array(measuredInsightSchema),
    skipped: z.array(skippedGoalSchema),
  })
  .meta({ id: 'MeasureResult' })

// Measures the Goals of the Project now. Returns the Insights it wrote and
// the Goals it could not measure.
export function handleMeasureProject(
  input: ApiRequest & { source: MetricSource },
) {
  return handleApiRequest(input, async () => {
    const result = await measureGoals({
      db: input.db,
      source: input.source,
      now: new Date(),
      productSlug: input.params.project,
    })
    return Response.json(result)
  })
}
