// The builds of a Project (D28): the pull requests of its repository, each
// with the Decisions and the Contract Version that its body names. A build
// stays in GitHub. Glue reads it live and keeps only what the gate said
// about it (glue/D48).
import { eq, max } from 'drizzle-orm'

import type { ConceptDb } from './client.ts'
import { listGates } from './gate.ts'
import type { Gate } from './gate.ts'
import { findProduct, listRepositoryProjects } from './projects.ts'
import { listParts } from './parts.ts'
import type { PartSummary } from './parts.ts'
import { ProductNotFoundError } from './record-errors.ts'
import { parseRecordReference } from './record-id.ts'
import * as schema from './schema.ts'
import type { GithubClient } from '../github/client.ts'
import { findContractLine, findDecisionIds } from '../github/pr-body.mjs'

// The Contract Version that a build names, with the newest Version of its
// Concept.
export type BuildContract = {
  // The slug of the Concept.
  concept: string
  title: string
  version: number
  newestVersion: number
}

export type Build = {
  // The number of the pull request.
  number: number
  url: string
  title: string
  state: 'open' | 'merged'
  // The Decisions that the body names and that the Project has.
  decisions: PartSummary[]
  // null: the body names no Contract Version that the Project has.
  contract: BuildContract | null
  // What the gate said the last time. null: no gate checked the build.
  gate: Gate | null
  // Its Contract Version is not the newest one, or a Decision of it is sunk.
  stale: boolean
}

// The builds that GitHub gave. `reason` says why there are none: the Project
// has no repository, or GitHub failed.
export type ProjectBuilds = { builds: Build[]; reason: string | null }

const NO_REPOSITORY = 'The Project has no repository'
// The most merged pull requests that are builds of the Project.
const MERGED_LIMIT = 10

const { concepts, contractVersions } = schema

// The newest Contract Version of each Concept of the Project, by its slug.
async function listNewestVersions(db: ConceptDb, projectId: number) {
  const found = await db
    .select({
      concept: concepts.slug,
      title: concepts.title,
      newestVersion: max(contractVersions.version),
    })
    .from(contractVersions)
    .innerJoin(concepts, eq(contractVersions.conceptId, concepts.id))
    .where(eq(concepts.projectId, projectId))
    .groupBy(concepts.id)
  return new Map(found.map((row) => [row.concept, row]))
}

// What the builds must name: one Decision, by its record id, or a Contract
// Version of one Concept, by the slug of the Concept.
export type BuildsNamed = { decision: string } | { concept: string }

// The word in the body of each pull request that names a Contract Version.
const CONTRACT_WORD = 'Contract'

// The open pull requests and the newest merged ones, the newest first. With
// `named`: each open or merged pull request that names it, from one search
// of GitHub.
export async function listBuilds(
  db: ConceptDb,
  github: GithubClient,
  projectSlug: string,
  named?: BuildsNamed,
): Promise<ProjectBuilds> {
  const project = await findProduct(db, projectSlug)
  if (!project) throw new ProductNotFoundError(projectSlug)
  if (!project.repository) return { builds: [], reason: NO_REPOSITORY }

  const [decisions, newestVersions, gates, projects] = await Promise.all([
    listParts(db, projectSlug, ['decision']),
    listNewestVersions(db, project.id),
    listGates(db, project.id),
    listRepositoryProjects(db, project.repository),
  ])
  const shared = projects.length > 1
  // The text of a search is the id of a Decision of the Project or the word
  // for a Contract, never the words of the person.
  if (
    named &&
    'decision' in named &&
    !decisions.some(({ id }) => id === named.decision)
  ) {
    return { builds: [], reason: null }
  }

  let pullRequests
  try {
    pullRequests = !named
      ? await github.listPullRequests(project.repository)
      : await github.searchPullRequests(
          project.repository,
          'decision' in named ? named.decision : CONTRACT_WORD,
        )
  } catch (error) {
    return {
      builds: [],
      reason: error instanceof Error ? error.message : String(error),
    }
  }

  const merged = pullRequests
    .filter(({ state }) => state === 'merged')
    .slice(0, MERGED_LIMIT)
  // The search finds the text at each place of the body: only the line that
  // names says what the build names.
  const names = (build: Build) =>
    !named ||
    ('decision' in named
      ? build.decisions.some(({ id }) => id === named.decision)
      : build.contract?.concept === named.concept)

  return {
    reason: null,
    builds: pullRequests
      .filter((pull) => named || pull.state === 'open' || merged.includes(pull))
      .map(({ body, ...pull }): Build => {
        // Its own `<project>/<id>` is a Decision of this Project, and so is
        // a bare id when no other Project shares the repository (glue/D50).
        // The id of another Project names nothing here.
        const ids = (findDecisionIds(body) ?? []).flatMap((reference) => {
          const { project: slug, recordId } = parseRecordReference(reference)
          return slug === projectSlug || (slug === undefined && !shared)
            ? [recordId]
            : []
        })
        const decided = decisions.filter(({ id }) => ids.includes(id))
        const line = findContractLine(body)
        const newest = line && newestVersions.get(line.concept)
        const contract =
          line && newest?.newestVersion != null
            ? {
                concept: newest.concept,
                title: newest.title,
                version: line.version,
                newestVersion: newest.newestVersion,
              }
            : null
        return {
          ...pull,
          decisions: decided,
          contract,
          gate: gates.get(pull.number) ?? null,
          stale:
            (contract !== null && contract.version < contract.newestVersion) ||
            decided.some(({ workState }) => workState === 'sunk'),
        }
      })
      .filter(names),
  }
}
