// The builds of a Project (D28): the pull requests of its repository, each
// with the Decisions and the Contract Version that its body names. A build
// stays in GitHub. Glue reads it live and keeps nothing.
import { eq, max } from 'drizzle-orm'

import type { ConceptDb } from './client.ts'
import { findProduct } from './projects.ts'
import { listParts } from './parts.ts'
import type { PartSummary } from './parts.ts'
import { ProductNotFoundError } from './record-errors.ts'
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

// The open pull requests and the newest merged ones, the newest first.
export async function listBuilds(
  db: ConceptDb,
  github: GithubClient,
  projectSlug: string,
): Promise<ProjectBuilds> {
  const project = await findProduct(db, projectSlug)
  if (!project) throw new ProductNotFoundError(projectSlug)
  if (!project.repository) return { builds: [], reason: NO_REPOSITORY }

  let pullRequests
  try {
    pullRequests = await github.listPullRequests(project.repository)
  } catch (error) {
    return {
      builds: [],
      reason: error instanceof Error ? error.message : String(error),
    }
  }

  const [decisions, newestVersions] = await Promise.all([
    listParts(db, projectSlug, ['decision']),
    listNewestVersions(db, project.id),
  ])
  const merged = pullRequests
    .filter(({ state }) => state === 'merged')
    .slice(0, MERGED_LIMIT)

  return {
    reason: null,
    builds: pullRequests
      .filter((pull) => pull.state === 'open' || merged.includes(pull))
      .map(({ body, ...pull }) => {
        const ids = findDecisionIds(body) ?? []
        const named = decisions.filter(({ id }) => ids.includes(id))
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
          decisions: named,
          contract,
          stale:
            (contract !== null && contract.version < contract.newestVersion) ||
            named.some(({ workState }) => workState === 'sunk'),
        }
      }),
  }
}
