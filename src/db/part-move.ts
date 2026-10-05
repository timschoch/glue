import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type { ConceptDb } from './client.ts'
import { findConceptId } from './part-records.ts'
import { getProjectId, listProjectReferences } from './projects.ts'
import { InvalidRecordError, PartNotFoundError } from './record-errors.ts'
import * as schema from './schema.ts'

// Where Parts go when they leave their Project.
export type MoveTarget = {
  project: string
  // The slug of the new home Concept, of the target Project.
  concept: string
  // Removes each Joint that the move would leave in a refused direction.
  dropRefusedJoints?: boolean
}

// A Joint that the move removed: both ends as `<project>/<record id>`, as
// they are after the move.
export type DroppedJoint = { part: string; needs: string }

const { parts, joints, projects } = schema
const neededParts = alias(parts, 'needed_parts')
const neededProjects = alias(projects, 'needed_projects')

// Moves the Parts to a Concept of another Project (D45), as one statement:
// all Parts move, or none. A Part keeps its record id, its Joints, its
// Trust, its Work state, its issue and its supersede link. A signed Contract
// Version is a stored copy, so it stays as it is.
//
// - A record id that the target Project has already refuses the move.
// - After the move, a Joint between two Projects is a reference. A reference
//   that the target Project or the source Project may not have refuses the
//   move, and so does a two-way Joint: `dropRefusedJoints` removes them.
export async function movePartsToProject(
  db: ConceptDb,
  projectSlug: string,
  recordIds: string[],
  target: MoveTarget,
): Promise<DroppedJoint[]> {
  if (target.project === projectSlug)
    throw new InvalidRecordError(
      `the Parts are in Project "${projectSlug}" already`,
    )
  if (recordIds.length === 0)
    throw new InvalidRecordError('a move needs a Part')
  const projectId = await getProjectId(db, projectSlug)
  const targetId = await getProjectId(db, target.project)
  const conceptId = await findConceptId(db, targetId, target.concept)

  const found = await db
    .select({
      id: parts.id,
      recordId: parts.recordId,
      projectId: parts.projectId,
    })
    .from(parts)
    .where(
      and(
        inArray(parts.projectId, [projectId, targetId]),
        inArray(parts.recordId, recordIds),
      ),
    )
  const moved = found.filter((part) => part.projectId === projectId)
  const missing = recordIds.find(
    (recordId) => !moved.some((part) => part.recordId === recordId),
  )
  if (missing !== undefined) throw new PartNotFoundError(missing)
  const taken = found.filter((part) => part.projectId === targetId)
  if (taken.length > 0)
    throw new InvalidRecordError(
      `Project "${target.project}" has ${taken.map((part) => `"${part.recordId}"`).join(', ')} already`,
    )

  const movedIds = moved.map(({ id }) => id)
  const [jointRows, references] = await Promise.all([
    db
      .select({
        id: joints.id,
        twoWay: joints.twoWay,
        part: {
          id: parts.id,
          recordId: parts.recordId,
          projectId: parts.projectId,
          project: projects.slug,
        },
        needed: {
          id: neededParts.id,
          recordId: neededParts.recordId,
          projectId: neededParts.projectId,
          project: neededProjects.slug,
        },
      })
      .from(joints)
      .innerJoin(parts, eq(joints.partId, parts.id))
      .innerJoin(projects, eq(parts.projectId, projects.id))
      .innerJoin(neededParts, eq(joints.neededPartId, neededParts.id))
      .innerJoin(neededProjects, eq(neededParts.projectId, neededProjects.id))
      .where(
        or(
          inArray(joints.partId, movedIds),
          inArray(joints.neededPartId, movedIds),
        ),
      )
      .orderBy(joints.id),
    listProjectReferences(db),
  ])
  // An end of a Joint as it is after the move.
  const toMovedEnd = (end: (typeof jointRows)[number]['part']) =>
    movedIds.includes(end.id)
      ? { ...end, projectId: targetId, project: target.project }
      : end
  const refused = jointRows.flatMap(({ id, twoWay, ...ends }) => {
    const part = toMovedEnd(ends.part)
    const needed = toMovedEnd(ends.needed)
    const allowed =
      part.projectId === needed.projectId ||
      (!twoWay &&
        references.some(
          (reference) =>
            reference.projectId === part.projectId &&
            reference.referencedProjectId === needed.projectId,
        ))
    return allowed
      ? []
      : [
          {
            id,
            part: `${part.project}/${part.recordId}`,
            needs: `${needed.project}/${needed.recordId}`,
          },
        ]
  })
  if (refused.length > 0 && !target.dropRefusedJoints)
    throw new InvalidRecordError(
      `the move leaves a Joint that no reference allows: ${refused.map(({ part, needs }) => `${part} needs ${needs}`).join(', ')}`,
    )

  // The Signals of an Insight go with it. The counter of the target Project
  // takes the highest number that came in, so that id never comes back.
  await db.execute(sql`
    with moved as (
      update "parts" set
        "project_id" = ${targetId}::integer,
        "concept_id" = ${conceptId}::integer,
        "changed_at" = now()
      where "id" in ${movedIds}
      returning "id", "type", "record_id"
    ),
    ${
      refused.length === 0
        ? sql``
        : sql`dropped as (
            delete from "joints" where "id" in ${refused.map(({ id }) => id)}
          ),`
    }
    moved_signals as (
      update "signals" set "project_id" = ${targetId}::integer
      where "part_id" in (select "id" from moved)
    ),
    counters as (
      insert into "part_counters" ("project_id", "type", "last_number")
      select
        ${targetId}::integer,
        "type",
        max(substring("record_id" from 2)::integer)
      from moved
      group by "type"
      on conflict ("project_id", "type") do update set "last_number" =
        greatest("part_counters"."last_number", excluded."last_number")
    )
    select "id" from moved
  `)
  return refused.map(({ part, needs }) => ({ part, needs }))
}
