// The Signals of a Project (D30, glue/D49). A Signal stays in its tool: an
// issue, a support ticket, an analytics event. Glue reads it through a
// Signal source and keeps only the link to the Insight that grew from it.
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { findProduct } from './projects.ts'
import { addInsightOfSignals } from './part-records.ts'
import { InvalidRecordError, ProductNotFoundError } from './record-errors.ts'
import * as schema from './schema.ts'

// A Signal as its tool gives it.
export type SourceSignal = {
  // The address of the Signal in its tool.
  url: string
  title: string
  // What the user said or did, in words. Empty: the tool has none.
  text: string
  // The day that the Signal came in: 2026-10-02.
  date: string
}

// The settings of a Project that say where its Signals are.
export type SignalProject = Pick<
  typeof schema.projects.$inferSelect,
  'repository' | 'analyticsProject' | 'supportUrl'
>

// The seam to a tool that holds Signals. An adapter reads the tool of the
// Project. A Project with no setting for the tool has no Signals there.
export type SignalSource = {
  name: string
  listSignals: (project: SignalProject) => Promise<SourceSignal[]>
}

export type Signal = SourceSignal & {
  // The name of the source that gave it.
  source: string
  // The Insight that grew from the Signal.
  insight: { id: string; title: string } | null
}

// A source that did not answer, and why.
export type SignalFailure = { source: string; reason: string }

// The Signals of the sources that answered, the newest first.
export type ProjectSignals = { signals: Signal[]; failures: SignalFailure[] }

export const signalInsightSchema = z.strictObject({
  signals: z
    .array(z.url())
    .min(1)
    .meta({ description: 'The addresses of the Signals that it grows from' }),
  title: z.string().trim().min(1),
  body: z.string().optional(),
  source: z.string().trim().min(1).optional().meta({
    description: 'Default: the addresses of the Signals',
  }),
  date: z.iso.date().optional(),
  evidenceLevel: z.enum(['hunch', 'pattern', 'confirmed']).default('hunch'),
  concept: z.string().optional().meta({
    description: 'The slug of the home Concept. Default: the root',
  }),
})

export type SignalInsight = z.input<typeof signalInsightSchema>

const { signals, parts } = schema

async function getProject(db: ConceptDb, projectSlug: string) {
  const project = await findProduct(db, projectSlug)
  if (!project) throw new ProductNotFoundError(projectSlug)
  return project
}

// Reads each source. One source that fails does not stop the others.
async function readSources(
  sources: ReadonlyArray<SignalSource>,
  project: SignalProject,
) {
  const answers = await Promise.allSettled(
    sources.map((source) => source.listSignals(project)),
  )
  const found: Array<SourceSignal & { source: string }> = []
  const failures: SignalFailure[] = []
  answers.forEach((answer, index) => {
    const { name } = sources[index]
    if (answer.status === 'fulfilled') {
      found.push(...answer.value.map((signal) => ({ ...signal, source: name })))
    } else {
      const { reason } = answer
      failures.push({
        source: name,
        reason: reason instanceof Error ? reason.message : String(reason),
      })
    }
  })
  return { found, failures }
}

// The Signals of the Project in all sources, or in the source of the name.
export async function listSignals(
  db: ConceptDb,
  sources: ReadonlyArray<SignalSource>,
  projectSlug: string,
  { source }: { source?: string } = {},
): Promise<ProjectSignals> {
  const project = await getProject(db, projectSlug)
  const asked =
    source === undefined
      ? sources
      : sources.filter(({ name }) => name === source)
  if (asked.length === 0) {
    const names = sources.map(({ name }) => name).join(', ')
    throw new InvalidRecordError(`"${source}" is no Signal source: ${names}`)
  }
  const { found, failures } = await readSources(asked, project)

  const grown = await db
    .select({ url: signals.url, id: parts.recordId, title: parts.title })
    .from(signals)
    .innerJoin(parts, eq(signals.partId, parts.id))
    .where(eq(signals.projectId, project.id))
  const insights = new Map(grown.map(({ url, ...insight }) => [url, insight]))

  return {
    failures,
    signals: found
      .map((signal) => ({
        ...signal,
        insight: insights.get(signal.url) ?? null,
      }))
      // A day as yyyy-mm-dd sorts as text. Signals of one day keep the
      // order of the sources.
      .sort((first, second) => second.date.localeCompare(first.date)),
  }
}

// Adds an Insight as a draft that grows from the Signals. Its level is
// hunch when the input names none. Gives back its record id.
export async function addSignalInsight(
  db: ConceptDb,
  sources: ReadonlyArray<SignalSource>,
  projectSlug: string,
  input: SignalInsight,
): Promise<string> {
  const parsed = signalInsightSchema.safeParse(input)
  if (!parsed.success)
    throw new InvalidRecordError(z.prettifyError(parsed.error))
  const { signals: given, ...insight } = parsed.data
  const urls = [...new Set(given)]

  const project = await getProject(db, projectSlug)
  const { found } = await readSources(sources, project)
  const picked = urls.map((url) => {
    const signal = found.find((listed) => listed.url === url)
    if (!signal)
      throw new InvalidRecordError(`"${url}" is not a Signal of the Project`)
    return signal
  })
  const grown = await db
    .select({ url: signals.url, id: parts.recordId })
    .from(signals)
    .innerJoin(parts, eq(signals.partId, parts.id))
    .where(and(eq(signals.projectId, project.id), inArray(signals.url, urls)))
  if (grown.length > 0)
    throw new InvalidRecordError(
      `"${grown[0].url}" grew into ${grown[0].id} already`,
    )

  return addInsightOfSignals(
    db,
    projectSlug,
    { ...insight, source: insight.source ?? urls.join(' ') },
    picked.map(({ url, title }) => ({ url, title })),
  )
}
