// The gate of a Project (glue/D48): it checks a build against the Contract
// of its Concept. The build holds, or it breaks with the reasons.
import { eq } from 'drizzle-orm'

import type { ConceptDb } from './client.ts'
import { findContract } from './contracts.ts'
import { findPart } from './parts.ts'
import type { DecisionStatus } from './parts.ts'
import {
  canReference,
  findProduct,
  listRepositoryProjects,
} from './projects.ts'
import { InvalidRecordError, ProductNotFoundError } from './record-errors.ts'
import { parseRecordReference } from './record-id.ts'
import { buildGates } from './schema.ts'
import type { GateResult } from './schema.ts'
import { findContractLine, findDecisionIds } from '../github/pr-body.mjs'
import { listGateReasons } from '../github/pr-gate.mjs'
import type { GateDecision } from '../github/pr-gate.mjs'

export { gateResults } from './schema.ts'
export type { GateResult } from './schema.ts'

// What the gate said about a build, and when.
export type Gate = { result: GateResult; reasons: string[]; checkedAt: string }

// A build as a check sends it: the pull request and its body.
export type ValidatedBuild = {
  repository: string
  number: number
  body: string
}

// The Decision that the body names. A bare id is a Decision of the Project,
// or of no Project when another Project shares the repository (glue/D50).
// `<project>/<id>` is one of a Project that this Project may reference (D45).
async function findNamedDecision(
  db: ConceptDb,
  projectSlug: string,
  reference: string,
  shared: boolean,
): Promise<GateDecision | undefined> {
  const named = parseRecordReference(reference)
  if (shared && named.project === undefined) return undefined
  const { project = projectSlug, recordId } = named
  if (
    project !== projectSlug &&
    !(await canReference(db, projectSlug, project))
  ) {
    return undefined
  }
  const part = await findPart(db, project, recordId)
  if (part?.type !== 'decision') return undefined
  return {
    status: part.status as DecisionStatus,
    superseded_by: part.supersededBy?.id,
  }
}

// The newest result of each build of the Project that the gate checked, by
// the number of the pull request.
export async function listGates(
  db: ConceptDb,
  projectId: number,
): Promise<Map<number, Gate>> {
  const kept = await db
    .select()
    .from(buildGates)
    .where(eq(buildGates.projectId, projectId))
  return new Map(
    kept.map(({ number, result, reasons, checkedAt }) => [
      number,
      { result, reasons, checkedAt: checkedAt.toISOString() },
    ]),
  )
}

// Checks the build and keeps the result with it. The next check of the same
// build replaces the result.
export async function validateBuild(
  db: ConceptDb,
  projectSlug: string,
  build: ValidatedBuild,
  now: Date = new Date(),
): Promise<Gate> {
  const project = await findProduct(db, projectSlug)
  if (!project) throw new ProductNotFoundError(projectSlug)
  if (!project.repository) {
    throw new InvalidRecordError(
      `Project "${projectSlug}" has no repository. Set it with \`pnpm concept project set ${projectSlug} --repository <owner/name>\`.`,
    )
  }
  if (project.repository !== build.repository) {
    throw new InvalidRecordError(
      `the builds of Project "${projectSlug}" are in the repository "${project.repository}"`,
    )
  }
  const projects = await listRepositoryProjects(db, project.repository)
  const shared = projects.length > 1
  const references = findDecisionIds(build.body) ?? []
  const decisions = new Map<string, GateDecision>()
  for (const reference of references) {
    const decision = await findNamedDecision(db, projectSlug, reference, shared)
    if (decision) decisions.set(reference, decision)
  }
  const named = findContractLine(build.body)
  const contract = named
    ? {
        concept: named.concept,
        newestVersion: (await findContract(db, projectSlug, named.concept))
          ?.version,
      }
    : undefined
  const reasons = listGateReasons({
    body: build.body,
    decisions,
    contract,
    projects: shared ? projects : undefined,
  })
  const result = reasons.length === 0 ? 'holds' : 'breaks'
  const kept = { result, reasons, checkedAt: now } as const
  await db
    .insert(buildGates)
    .values({ projectId: project.id, number: build.number, ...kept })
    .onConflictDoUpdate({
      target: [buildGates.projectId, buildGates.number],
      set: kept,
    })

  return { result, reasons, checkedAt: now.toISOString() }
}
