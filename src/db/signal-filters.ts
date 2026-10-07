// The saved filters of the Signals list of a Project (glue/D66). A member
// saves a filter with a name. Each member of the Project sees it beside the
// source filters. The rule of a filter: signal-filter-rule.ts.
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { getProjectId } from './projects.ts'
import {
  InvalidRecordError,
  SignalFilterNotFoundError,
} from './record-errors.ts'
import * as schema from './schema.ts'
import type { SignalFilterRule } from './signal-filter-rule.ts'

const { signalFilters } = schema

export type SignalFilter = SignalFilterRule & { id: number; name: string }

const words = z.array(z.string().trim().min(1)).default([])

export const signalFilterSchema = z
  .strictObject({
    name: z.string().trim().min(1),
    mustHold: words.meta({
      description: 'The Signal holds each word, in its title or its text',
    }),
    mustNotHold: words.meta({
      description: 'The Signal holds none of the words',
    }),
    sources: words.meta({
      description: 'The names of the sources. None: each source passes',
    }),
  })
  .refine(
    ({ mustHold, mustNotHold, sources }) =>
      mustHold.length + mustNotHold.length + sources.length > 0,
    { error: 'A filter needs a word or a source' },
  )

export type NewSignalFilter = z.input<typeof signalFilterSchema>

function parseFilter(input: NewSignalFilter) {
  const parsed = signalFilterSchema.safeParse(input)
  if (!parsed.success)
    throw new InvalidRecordError(z.prettifyError(parsed.error))
  return parsed.data
}

const columns = {
  id: signalFilters.id,
  name: signalFilters.name,
  mustHold: signalFilters.mustHold,
  mustNotHold: signalFilters.mustNotHold,
  sources: signalFilters.sources,
}

// The name is free in the Project, or it is the name of the filter itself.
async function validateName(
  db: ConceptDb,
  projectId: number,
  name: string,
  id?: number,
) {
  const named = await db
    .select({ id: signalFilters.id })
    .from(signalFilters)
    .where(
      and(eq(signalFilters.projectId, projectId), eq(signalFilters.name, name)),
    )
  if (named.some((filter) => filter.id !== id))
    throw new InvalidRecordError(`"${name}" is a filter already`)
}

// The saved filters of the Project, by name.
export async function listSignalFilters(
  db: ConceptDb,
  projectSlug: string,
): Promise<SignalFilter[]> {
  const projectId = await getProjectId(db, projectSlug)
  return db
    .select(columns)
    .from(signalFilters)
    .where(eq(signalFilters.projectId, projectId))
    .orderBy(asc(signalFilters.name), asc(signalFilters.id))
}

// The saved filter of the Project with the id.
export async function getSignalFilter(
  db: ConceptDb,
  projectSlug: string,
  id: number,
): Promise<SignalFilter> {
  const filters = await listSignalFilters(db, projectSlug)
  const filter = filters.find((listed) => listed.id === id)
  if (!filter) throw new SignalFilterNotFoundError(id)
  return filter
}

export async function addSignalFilter(
  db: ConceptDb,
  projectSlug: string,
  input: NewSignalFilter,
): Promise<SignalFilter> {
  const filter = parseFilter(input)
  const projectId = await getProjectId(db, projectSlug)
  await validateName(db, projectId, filter.name)
  const [added] = await db
    .insert(signalFilters)
    .values({ projectId, ...filter })
    .returning(columns)
  return added
}

// Puts the new values in place of all values of the filter.
export async function updateSignalFilter(
  db: ConceptDb,
  projectSlug: string,
  id: number,
  input: NewSignalFilter,
): Promise<SignalFilter> {
  const filter = parseFilter(input)
  const projectId = await getProjectId(db, projectSlug)
  await getSignalFilter(db, projectSlug, id)
  await validateName(db, projectId, filter.name, id)
  const [changed] = await db
    .update(signalFilters)
    .set(filter)
    .where(eq(signalFilters.id, id))
    .returning(columns)
  return changed
}

export async function removeSignalFilter(
  db: ConceptDb,
  projectSlug: string,
  id: number,
): Promise<void> {
  await getSignalFilter(db, projectSlug, id)
  await db.delete(signalFilters).where(eq(signalFilters.id, id))
}
