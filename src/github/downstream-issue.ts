// An accepted Decision flows downstream: Glue opens one GitHub issue for it
// in the repository of its Product, so the builders of the Product build it.
import type { ConceptDb } from '../db/client.ts'
import { setIssueUrl } from '../db/part-records.ts'
import { findPart } from '../db/parts.ts'
import type { Part, PartSummary } from '../db/parts.ts'
import { findProduct, listRepositoryProjects } from '../db/projects.ts'
import { typeOfRecordId } from '../db/record-id.ts'
import { isEvidence } from '../part-fields.ts'
import type { GithubClient, IssueInput } from './client.ts'

export type DownstreamIssue =
  | { kind: 'created' | 'existing'; url: string }
  | { kind: 'not-accepted' | 'no-repository' | 'not-found' }
  // GitHub failed. The Decision keeps its status, a retry opens the issue.
  | { kind: 'failed'; message: string }

const READY_LABEL = 'ready-for-agent'

function formatReferences(heading: string, references: PartSummary[]) {
  if (references.length === 0) return []
  return [
    `${heading}:`,
    ...references.map((reference) => `- ${reference.id} ${reference.title}`),
  ]
}

// `reference` names the Decision as a build of the repository writes it.
function toIssue(
  decision: Part,
  goal: PartSummary,
  reference: string,
): IssueInput {
  const needed = decision.needs.map((end) => end.part)
  const sections = [
    [decision.body],
    [`Goal: ${goal.id} ${goal.title}`],
    formatReferences(
      'Evidence',
      needed.filter((part) => isEvidence(part.type)),
    ),
    formatReferences('Supersedes', decision.supersedes),
    [`Decision: ${reference}`],
  ].filter((lines) => lines.some(Boolean))
  return {
    title: `${decision.id}: ${decision.title}`,
    body: sections.map((lines) => lines.join('\n')).join('\n\n'),
    labels: [READY_LABEL],
  }
}

// Opens the issue when the Part is an accepted Decision. Every write that
// can leave a Decision accepted calls it with the record id of the Part, so
// the CLI, the HTTP API and the app all open the issue. A Decision with an
// issue opens no second one.
export async function createDownstreamIssue(
  db: ConceptDb,
  github: GithubClient,
  productSlug: string,
  decisionId: string,
): Promise<DownstreamIssue> {
  if (typeOfRecordId(decisionId) !== 'decision') return { kind: 'not-found' }
  const decision = await findPart(db, productSlug, decisionId)
  const goal = decision?.needs.find((end) => end.part.type === 'goal')?.part
  if (!decision || !goal) return { kind: 'not-found' }
  if (decision.issueUrl) return { kind: 'existing', url: decision.issueUrl }
  if (decision.status !== 'accepted') return { kind: 'not-accepted' }
  const product = await findProduct(db, productSlug)
  if (!product?.repository) return { kind: 'no-repository' }
  const { repository } = product

  // In a repository that another Project has too, a bare id names no
  // Decision (glue/D50).
  const shared = (await listRepositoryProjects(db, repository)).length > 1
  const reference = shared ? `${productSlug}/${decision.id}` : decision.id

  let url: string
  try {
    url = await github.createIssue(
      repository,
      toIssue(decision, goal, reference),
    )
  } catch (error) {
    return {
      kind: 'failed',
      message: error instanceof Error ? error.message : String(error),
    }
  }

  // A Decision with an issue keeps it.
  await setIssueUrl(db, productSlug, decisionId, url)
  return { kind: 'created', url }
}
