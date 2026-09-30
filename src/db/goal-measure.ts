import { z } from 'zod'

const source = z.literal('mock-analytics')
const windowDays = z.number().int().positive()
const breakdown = z
  .string()
  .min(1)
  .optional()
  .meta({ description: 'An event property, for example app_version' })

// A funnel in a metric source. The conversion from the first to the last
// step must reach `target` within `window_days`.
export const funnelMeasureSchema = z
  .strictObject({
    kind: z.literal('funnel'),
    source,
    steps: z.array(z.string().min(1)).min(2),
    target: z.number().min(0).max(1),
    window_days: windowDays,
    breakdown,
  })
  .meta({ id: 'FunnelMeasure' })

export const propertyFilterSchema = z
  .strictObject({
    property: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean()]),
  })
  .meta({
    id: 'PropertyFilter',
    description: 'Only the events whose property equals the value',
  })

export type PropertyFilter = z.infer<typeof propertyFilterSchema>

// The mean of one event property over the last `window_days`, for example
// the answer in posthog-js survey events. The first measure stores the
// baseline. The mean must move `target_change` away from it.
export const meanMeasureSchema = z
  .strictObject({
    kind: z.literal('mean'),
    source,
    event: z.string().min(1).meta({ description: 'For example survey sent' }),
    property: z
      .string()
      .min(1)
      .meta({ description: 'The event property that holds a number' }),
    where: propertyFilterSchema.optional(),
    target_change: z
      .number()
      .refine((change) => change !== 0, 'must not be 0')
      .meta({
        description:
          'The change from the baseline the Goal wants, for example 1 or -0.5',
      }),
    window_days: windowDays,
    breakdown,
  })
  .meta({ id: 'MeanMeasure' })

// How Glue measures a Goal.
export const goalMeasureSchema = z
  .discriminatedUnion('kind', [funnelMeasureSchema, meanMeasureSchema])
  .meta({ id: 'GoalMeasure' })

export type FunnelMeasure = z.infer<typeof funnelMeasureSchema>
export type MeanMeasure = z.infer<typeof meanMeasureSchema>
export type GoalMeasure = z.infer<typeof goalMeasureSchema>
