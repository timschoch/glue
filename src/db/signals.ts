// The Signals of a Project (D30): the issues with the label `user-feedback`
// in its repository. A Signal stays in GitHub. Glue keeps only the link to
// the Insight that grew from it.
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { findProduct } from './concept.ts'
import { addPart } from './part-records.ts'
import { InvalidRecordError, ProductNotFoundError } from './record-errors.ts'
import * as schema from './schema.ts'
import type { GithubClient } from '../github/client.ts'

export const SIGNAL_LABEL = 'user-feedback'

export type Signal = {
  // The address of the issue.
  url: string
  title: string
  // The day that the issue was opened.
  date: string
  // The Insight that grew from the Signal.
  insight: { id: string; title: string } | null
}

// The Signals that GitHub gave. `reason` says why there are none: the
// Project has no repository, or GitHub failed.
export type ProjectSignals = { signals: Signal[]; reason: string | null }

export const signalInsightSchema = z.strictObject({
  signals: z
    .array(z.url())
    .min(1)
    .meta({ description: 'The addresses of the Signals that it grows from' }),
  title: z.string().trim().min(1),
  body: z.string().optional(),
  source: z.string().trim().min(1).optional().meta({
    description: 'Default: the address of the label in the repository',
  }),
  date: z.iso.date().optional(),
  evidenceLevel: z.enum(['hunch', 'pattern', 'confirmed']).default('hunch'),
  concept: z.string().optional().meta({
    description: 'The slug of the home Concept. Default: the root',
  }),
})

export type SignalInsight = z.input<typeof signalInsightSchema>

const NO_REPOSITORY = 'The Project has no repository'

const { signals, parts } = schema

async function getProject(db: ConceptDb, projectSlug: string) {
  const project = await findProduct(db, projectSlug)
  if (!project) throw new ProductNotFoundError(projectSlug)
  return project
}

export async function listSignals(
  db: ConceptDb,
  github: GithubClient,
  projectSlug: string,
): Promise<ProjectSignals> {
  const { id, repository } = await getProject(db, projectSlug)
  if (!repository) return { signals: [], reason: NO_REPOSITORY }

  let issues
  try {
    issues = await github.listIssues(repository, SIGNAL_LABEL)
  } catch (error) {
    return {
      signals: [],
      reason: error instanceof Error ? error.message : String(error),
    }
  }

  const grown = await db
    .select({ url: signals.url, id: parts.recordId, title: parts.title })
    .from(signals)
    .innerJoin(parts, eq(signals.partId, parts.id))
    .where(eq(signals.projectId, id))
  const insights = new Map(grown.map(({ url, ...insight }) => [url, insight]))

  return {
    reason: null,
    signals: issues.map(({ url, title, createdAt }) => ({
      url,
      title,
      date: createdAt.slice(0, 'yyyy-mm-dd'.length),
      insight: insights.get(url) ?? null,
    })),
  }
}

// Adds an Insight as a draft that grows from the Signals. Its level is
// hunch when the input names none. Gives back its record id. A GitHub failure adds nothing.
export async function addSignalInsight(
  db: ConceptDb,
  github: GithubClient,
  projectSlug: string,
  input: SignalInsight,
): Promise<string> {
  const parsed = signalInsightSchema.safeParse(input)
  if (!parsed.success)
    throw new InvalidRecordError(z.prettifyError(parsed.error))
  const { signals: urls, ...insight } = parsed.data

  const { id: projectId, repository } = await getProject(db, projectSlug)
  if (!repository) throw new InvalidRecordError(NO_REPOSITORY)

  const issues = await github.listIssues(repository, SIGNAL_LABEL)
  const picked = [...new Set(urls)].map((url) => {
    const issue = issues.find((listed) => listed.url === url)
    if (!issue)
      throw new InvalidRecordError(`"${url}" is not a Signal of the Project`)
    return issue
  })
  const grown = await db
    .select({ url: signals.url, id: parts.recordId })
    .from(signals)
    .innerJoin(parts, eq(signals.partId, parts.id))
    .where(and(eq(signals.projectId, projectId), inArray(signals.url, urls)))
  if (grown.length > 0)
    throw new InvalidRecordError(
      `"${grown[0].url}" grew into ${grown[0].id} already`,
    )

  const recordId = await addPart(db, projectSlug, {
    ...insight,
    type: 'insight',
    source:
      insight.source ??
      `https://github.com/${repository}/labels/${SIGNAL_LABEL}`,
    status: 'draft',
  })
  const [part] = await db
    .select({ id: parts.id })
    .from(parts)
    .where(and(eq(parts.projectId, projectId), eq(parts.recordId, recordId)))
  await db.insert(signals).values(
    picked.map(({ url, title }) => ({
      projectId,
      url,
      title,
      partId: part.id,
    })),
  )
  return recordId
}
