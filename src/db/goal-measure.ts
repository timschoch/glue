import { z } from 'zod'

// How Glue measures a Goal: a funnel in a metric source. The conversion from
// the first to the last step must reach `target` within `window_days`.
export const goalMeasureSchema = z
  .strictObject({
    source: z.literal('mock-analytics'),
    project: z.string().min(1),
    steps: z.array(z.string().min(1)).min(2),
    target: z.number().min(0).max(1),
    window_days: z.number().int().positive(),
    breakdown: z
      .string()
      .min(1)
      .optional()
      .meta({ description: 'An event property, for example app_version' }),
  })
  .meta({ id: 'GoalMeasure' })

export type GoalMeasure = z.infer<typeof goalMeasureSchema>
