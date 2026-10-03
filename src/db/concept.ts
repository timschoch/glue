import { and, eq, isNotNull } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { goalMeasureSchema } from './goal-measure.ts'
import { ProductNotFoundError } from './record-errors.ts'
import * as schema from './schema.ts'

// The shapes of the Concept as Glue shows it. The HTTP API documents its
// responses with these schemas, so the types come from them.
// legacy-records.ts reads these shapes from the Parts.
export const recordReferenceSchema = z
  .object({ id: z.string(), title: z.string() })
  .meta({ id: 'RecordReference' })

export type RecordReference = z.infer<typeof recordReferenceSchema>

export const goalSchema = z
  .object({
    kind: z.literal('goal'),
    ...recordReferenceSchema.shape,
    metric: z.string(),
    source: z.string(),
    measure: goalMeasureSchema.nullable(),
    status: z.enum(schema.goalStatuses).meta({
      description: 'A person or an agent sets it. Glue never closes a Goal',
    }),
    baseline: z.number().nullable().meta({
      description:
        'A mean measure: the mean of the first measure run, or of the baseline value',
    }),
    latestValue: z.number().nullable().meta({
      description:
        'A mean measure: the mean of the last measure run, or of its latest breakdown value',
    }),
    latestBreakdownValue: z.string().nullable().meta({
      description:
        'A mean measure with a baseline value: the breakdown value the last measure run saw last',
    }),
    measuredAt: z.iso.datetime().nullable().meta({
      description: 'The time of the last measure run that read a value',
    }),
    body: z.string(),
    decisions: z.array(recordReferenceSchema),
  })
  .meta({ id: 'Goal' })

export type Goal = z.infer<typeof goalSchema>

export const decisionSchema = z
  .object({
    kind: z.literal('decision'),
    ...recordReferenceSchema.shape,
    date: z.iso.date(),
    owner: z.string(),
    status: z.enum(schema.decisionStatuses),
    body: z.string(),
    goal: recordReferenceSchema,
    evidence: z.array(recordReferenceSchema),
    supersededBy: recordReferenceSchema.nullable(),
    supersedes: z.array(recordReferenceSchema),
    issueUrl: z.url().nullable().meta({
      description:
        'The issue that builds the accepted Decision in the repository of its Product',
    }),
  })
  .meta({ id: 'Decision' })

export type Decision = z.infer<typeof decisionSchema>

export const insightSchema = z
  .object({
    kind: z.literal('insight'),
    ...recordReferenceSchema.shape,
    date: z.iso.date(),
    source: z.string(),
    status: z.enum(schema.insightStatuses).nullable(),
    body: z.string(),
    decisions: z.array(recordReferenceSchema),
  })
  .meta({ id: 'Insight' })

export type Insight = z.infer<typeof insightSchema>

export const factSchema = z
  .object({
    kind: z.literal('fact'),
    ...recordReferenceSchema.shape,
    source: z.string(),
    body: z.string(),
    decisions: z.array(recordReferenceSchema),
  })
  .meta({ id: 'Fact' })

export type Fact = z.infer<typeof factSchema>

export const guardrailSchema = z
  .object({
    kind: z.literal('guardrail'),
    ...recordReferenceSchema.shape,
    enforcedBy: z.string(),
    body: z.string(),
  })
  .meta({ id: 'Guardrail' })

export type Guardrail = z.infer<typeof guardrailSchema>

// A record with its links in both directions.
export type LinkedRecord = Goal | Decision | Insight | Fact | Guardrail

// A Decision as the overview shows it, without its body.
export const decisionSummarySchema = decisionSchema
  .pick({
    id: true,
    title: true,
    date: true,
    owner: true,
    status: true,
    goal: true,
    evidence: true,
  })
  .meta({ id: 'DecisionSummary' })

export type DecisionSummary = z.infer<typeof decisionSummarySchema>

// The overview of each folder, as the Concept lists it.
export const conceptSummarySchemas = {
  goals: goalSchema
    .pick({
      id: true,
      title: true,
      metric: true,
      status: true,
      latestValue: true,
    })
    .meta({ id: 'GoalSummary' }),
  decisions: decisionSummarySchema,
  guardrails: guardrailSchema
    .pick({ id: true, title: true, enforcedBy: true })
    .meta({ id: 'GuardrailSummary' }),
  insights: insightSchema
    .pick({ id: true, title: true, date: true, status: true })
    .meta({ id: 'InsightSummary' }),
  facts: recordReferenceSchema,
}

export const conceptSchema = z
  .object({
    product: z.object({ slug: z.string(), name: z.string() }),
    goals: z.array(conceptSummarySchemas.goals),
    decisions: z.array(conceptSummarySchemas.decisions),
    guardrails: z.array(conceptSummarySchemas.guardrails),
    insights: z.array(conceptSummarySchemas.insights),
    facts: z.array(conceptSummarySchemas.facts),
  })
  .meta({ id: 'Concept' })

export type Concept = z.infer<typeof conceptSchema>

const { projects } = schema

export async function findProduct(db: ConceptDb, productSlug: string) {
  const found = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, productSlug))
  return found.at(0)
}

// The row id of the Project of the slug.
export async function getProjectId(db: ConceptDb, projectSlug: string) {
  const project = await findProduct(db, projectSlug)
  if (!project) throw new ProductNotFoundError(projectSlug)
  return project.id
}

export type Product = Concept['product']

// A Product whose public comments Glue reads, with its read position.
export type SocialProduct = {
  id: number
  slug: string
  handle: string
  readUntil: Date | null
}

// The Products with a social handle: all of them, or the one of the slug.
export async function listSocialProducts(
  db: ConceptDb,
  productSlug?: string,
): Promise<SocialProduct[]> {
  const rows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      handle: projects.socialHandle,
      readUntil: projects.commentsReadUntil,
    })
    .from(projects)
    .where(
      and(
        isNotNull(projects.socialHandle),
        productSlug === undefined ? undefined : eq(projects.slug, productSlug),
      ),
    )
    .orderBy(projects.id)
  return rows.flatMap(({ handle, ...row }) =>
    handle ? [{ ...row, handle }] : [],
  )
}
