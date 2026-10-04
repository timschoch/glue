import { and, eq, or, sql } from 'drizzle-orm'

import type { ConceptDb } from './client.ts'
import { sortById } from './record-id.ts'
import * as schema from './schema.ts'

// What the measure step reads from the Parts: the Goals it measures, the
// Decisions it names in an Insight, and the Insights it wrote before.

const { projects, parts, joints, measures } = schema

// The open Goals and the Metrics with a measure, each with the Project that
// holds it: of all Projects, or of the one of the slug. The measure is as
// stored, not parsed. `goalId` is the row id of the Part.
export function listGoalsWithMeasure(db: ConceptDb, projectSlug?: string) {
  return db
    .select({
      productId: projects.id,
      productSlug: projects.slug,
      analyticsProject: projects.analyticsProject,
      goalId: parts.id,
      goalRecordId: parts.recordId,
      type: parts.type,
      baseline: measures.baseline,
      measure: measures.measure,
    })
    .from(parts)
    .innerJoin(measures, eq(measures.partId, parts.id))
    .innerJoin(projects, eq(parts.projectId, projects.id))
    .where(
      and(
        or(
          and(eq(parts.type, 'goal'), eq(parts.status, 'open')),
          eq(parts.type, 'metric'),
        ),
        projectSlug === undefined ? undefined : eq(projects.slug, projectSlug),
      ),
    )
    .orderBy(parts.id)
}

// The accepted Decisions that need the Goal, by the row id of the Goal.
export async function listAcceptedDecisions(db: ConceptDb, goalId: number) {
  const accepted = await db
    .select({ id: parts.recordId, title: parts.title })
    .from(joints)
    .innerJoin(parts, eq(joints.partId, parts.id))
    .where(
      and(
        eq(joints.neededPartId, goalId),
        eq(parts.type, 'decision'),
        eq(parts.status, 'accepted'),
      ),
    )
  return sortById(accepted)
}

// The id of the Insight of the Project with this source, or null.
export async function findInsightIdBySource(
  db: ConceptDb,
  projectId: number,
  insightSource: string,
) {
  const found = await db
    .select({ id: parts.recordId })
    .from(parts)
    .where(
      and(
        eq(parts.projectId, projectId),
        eq(parts.type, 'insight'),
        eq(parts.source, insightSource),
      ),
    )
  return found.at(0)?.id ?? null
}

// The source and the date of each Insight of the Project. An unknown Project
// has none. The check `parts_type_fields_check` gives each Insight both.
export function listInsightSources(db: ConceptDb, projectSlug: string) {
  return db
    .select({
      id: parts.recordId,
      source: sql<string>`${parts.source}`,
      date: sql<string>`${parts.date}`,
    })
    .from(parts)
    .innerJoin(projects, eq(parts.projectId, projects.id))
    .where(and(eq(projects.slug, projectSlug), eq(parts.type, 'insight')))
}
