// The gate of a Project (glue/D48): it checks a build against the Contract
// of its Concept. The build holds, or it breaks with the reasons. It reads
// the Guardrails of the Contract Version that the build names (glue/D59): a
// Guardrail with a check of the repository that failed breaks the build.
import { eq } from 'drizzle-orm'

import type { ConceptDb } from './client.ts'
import { findContract } from './contracts.ts'
import type { Contract } from './contracts.ts'
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
import type { GateGuardrail, GateResult, GuardrailState } from './schema.ts'
import type { CheckRun, GithubClient } from '../github/client.ts'
import { findContractLine, findDecisionIds } from '../github/pr-body.mjs'
import { listGateReasons } from '../github/pr-gate.mjs'
import type { GateDecision } from '../github/pr-gate.mjs'

export { gateResults, guardrailStates } from './schema.ts'
export type { GateGuardrail, GateResult, GuardrailState } from './schema.ts'

// What the gate said about a build, and when. `guardrails` has the
// Guardrails of the Contract Version that the build names.
export type Gate = {
  result: GateResult
  reasons: string[]
  guardrails: GateGuardrail[]
  checkedAt: string
}

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

// A Guardrail names a check of the repository in its "enforced by" as
// `check: <name>`, for example `check: verify`. Each other text says what a
// person does.
const CHECK_LINE = /^check:\s*(.+)$/i

function findCheckName(enforcedBy: string): string | undefined {
  return enforcedBy.trim().match(CHECK_LINE)?.[1]
}

// A check that failed wins over one that waits, and that one over one that
// passed. No check with the name: it has not run.
function findCheckState(name: string, checks: CheckRun[]): GuardrailState {
  const states = checks
    .filter((check) => check.name === name)
    .map(({ state }) => state)
  if (states.includes('failed')) return 'failed'
  return states.includes('waiting') || states.length === 0
    ? 'waiting'
    : 'passed'
}

// The Guardrails of the Contract Version, each with its state on the head
// commit of the build. GitHub is asked only when a Guardrail names a check.
async function listGuardrails(
  github: GithubClient,
  build: ValidatedBuild,
  contract: Contract | undefined,
): Promise<GateGuardrail[]> {
  const guardrails = (contract?.tier1 ?? []).flatMap((part) =>
    part.type === 'guardrail'
      ? [{ ...part, enforcedBy: part.enforcedBy ?? '' }]
      : [],
  )
  const checks = guardrails.some(
    ({ enforcedBy }) => findCheckName(enforcedBy) !== undefined,
  )
    ? await github.listCheckRuns(build.repository, build.number)
    : []
  return guardrails.map(({ id, title, concept, enforcedBy }) => {
    const name = findCheckName(enforcedBy)
    return {
      id,
      title,
      concept,
      enforcedBy,
      state: name === undefined ? 'by-person' : findCheckState(name, checks),
    }
  })
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
    kept.map(({ number, result, reasons, guardrails, checkedAt }) => [
      number,
      { result, reasons, guardrails, checkedAt: checkedAt.toISOString() },
    ]),
  )
}

// Checks the build and keeps the result with it. The next check of the same
// build replaces the result.
export async function validateBuild(
  db: ConceptDb,
  github: GithubClient,
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
  const newest = named
    ? await findContract(db, projectSlug, named.concept)
    : undefined
  // The Version that the build names. An older one breaks the build, and
  // its Guardrails are still the ones of the build.
  const built =
    named && newest && newest.version !== named.version
      ? await findContract(db, projectSlug, named.concept, named.version)
      : newest
  const guardrails = await listGuardrails(github, build, built)
  const reasons = [
    ...listGateReasons({
      body: build.body,
      decisions,
      contract: named
        ? { concept: named.concept, newestVersion: newest?.version }
        : undefined,
      projects: shared ? projects : undefined,
    }),
    ...guardrails.flatMap(({ id, enforcedBy, state }) =>
      state === 'failed'
        ? [
            `Guardrail "${id}" failed: the check "${findCheckName(enforcedBy)}" did not pass on the head commit. Fix the check and run the gate again.`,
          ]
        : [],
    ),
  ]
  const result = reasons.length === 0 ? 'holds' : 'breaks'
  const kept = { result, reasons, guardrails, checkedAt: now } as const
  await db
    .insert(buildGates)
    .values({ projectId: project.id, number: build.number, ...kept })
    .onConflictDoUpdate({
      target: [buildGates.projectId, buildGates.number],
      set: kept,
    })

  return { result, reasons, guardrails, checkedAt: now.toISOString() }
}
