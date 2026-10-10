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
import { applySignalFilters } from './signal-filter-rule.ts'
import { getSignalFilter } from './signal-filters.ts'
import { toTitle } from './signal-groups.ts'
import type { SignalGroup } from './signal-groups.ts'

// A Signal as its tool gives it.
export type SourceSignal = {
  // The address of the Signal in its tool.
  url: string
  title: string
  // `glue`: the tool has no title, so the source gave it one. No value: a
  // person wrote the title.
  titleBy?: 'glue'
  // What the user said or did, in words. Empty: the tool has none.
  text: string
  // The day that the Signal came in: 2026-10-02.
  date: string
}

// The settings of a Project that say where its Signals are.
export type SignalProject = Pick<
  typeof schema.projects.$inferSelect,
  | 'repository'
  | 'analyticsProject'
  | 'supportUrl'
  | 'socialHandle'
  | 'marketUrl'
>

// The seam to a tool that holds Signals. An adapter reads the tool of the
// Project. A Project with no setting for the tool has no Signals there.
export type SignalSource = {
  name: string
  // The name as a person reads it. None: the name itself.
  label?: string
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

// The Signals of the sources that answered, the newest first, and the
// groups of the ones that say the same thing.
export type ProjectSignals = {
  // Each source of the Project, with the name that a person reads.
  sources: Array<{ name: string; label: string }>
  signals: Signal[]
  failures: SignalFailure[]
  groups: SignalGroup[]
}

export const signalInsightSchema = z.strictObject({
  signals: z
    .array(z.url())
    .min(1)
    .meta({ description: 'The addresses of the Signals that it grows from' }),
  title: z.string().trim().min(1).optional().meta({
    description: 'Default: the title of the newest Signal',
  }),
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

// Reads each source. One source that fails does not stop the others. The
// address of a Signal names it: the first source that has an address keeps
// it, and a later source cannot give a Signal with it.
async function readSources(
  sources: ReadonlyArray<SignalSource>,
  project: SignalProject,
) {
  const answers = await Promise.allSettled(
    sources.map((source) => source.listSignals(project)),
  )
  const found: Array<SourceSignal & { source: string }> = []
  const failures: SignalFailure[] = []
  const taken = new Set<string>()
  answers.forEach((answer, index) => {
    const { name } = sources[index]
    if (answer.status === 'fulfilled') {
      const own = answer.value.filter(({ url }) => !taken.has(url))
      own.forEach(({ url }) => taken.add(url))
      found.push(...own.map((signal) => ({ ...signal, source: name })))
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
// `filter` is the id of a saved filter of the Project: only the Signals
// that pass it, and their groups.
export async function listSignals(
  db: ConceptDb,
  sources: ReadonlyArray<SignalSource>,
  projectSlug: string,
  { source, filter }: { source?: string; filter?: number } = {},
): Promise<ProjectSignals> {
  const project = await getProject(db, projectSlug)
  const filters =
    filter === undefined ? [] : [await getSignalFilter(db, projectSlug, filter)]
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

  const listed = found
    .map((signal) => ({
      ...signal,
      insight: insights.get(signal.url) ?? null,
    }))
    // A day as yyyy-mm-dd sorts as text. Signals of one day keep the
    // order of the sources.
    .sort((first, second) => second.date.localeCompare(first.date))
  return {
    sources: sources.map(({ name, label = name }) => ({ name, label })),
    failures,
    ...applySignalFilters(listed, filters),
  }
}

// Adds an Insight as a draft that grows from the Signals. Its level is
// hunch when the input names none, and its title is what the newest Signal
// is about. So the Signals of a group become a Hunch in one step, with the
// title of the group. Gives back its record id.
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
    {
      ...insight,
      title: insight.title ?? toTitle(picked),
      source: insight.source ?? urls.join(' '),
    },
    picked.map(({ url, title }) => ({ url, title })),
  )
}
