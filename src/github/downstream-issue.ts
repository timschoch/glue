// An accepted Decision flows downstream: Glue opens one GitHub issue for it
// in the repository of its Product, so the builders of the Product build it.
import { and, eq, isNull } from 'drizzle-orm'

import type { ConceptDb } from '../db/client.ts'
import { findRecord } from '../db/concept.ts'
import type { Decision, RecordReference } from '../db/concept.ts'
import * as schema from '../db/schema.ts'
import type { GithubClient, IssueInput } from './client.ts'

export type DownstreamIssue =
  | { kind: 'created' | 'existing'; url: string }
  | { kind: 'not-accepted' | 'no-repository' | 'not-found' }
  // GitHub failed. The Decision keeps its status, a retry opens the issue.
  | { kind: 'failed'; message: string }

const READY_LABEL = 'ready-for-agent'

function formatReferences(heading: string, references: RecordReference[]) {
  if (references.length === 0) return []
  return [
    `${heading}:`,
    ...references.map((reference) => `- ${reference.id} ${reference.title}`),
  ]
}

function toIssue(decision: Decision): IssueInput {
  const sections = [
    [decision.body],
    [`Goal: ${decision.goal.id} ${decision.goal.title}`],
    formatReferences('Evidence', decision.evidence),
    formatReferences('Supersedes', decision.supersedes),
    [`Decision: ${decision.id}`],
  ].filter((lines) => lines.some(Boolean))
  return {
    title: `${decision.id}: ${decision.title}`,
    body: sections.map((lines) => lines.join('\n')).join('\n\n'),
    labels: [READY_LABEL],
  }
}

// Opens the issue once. A Decision with an issue opens no second one.
export async function createDownstreamIssue(
  db: ConceptDb,
  github: GithubClient,
  productSlug: string,
  decisionId: string,
): Promise<DownstreamIssue> {
  const decision = await findRecord(db, productSlug, decisionId)
  if (decision?.kind !== 'decision') return { kind: 'not-found' }
  if (decision.issueUrl) return { kind: 'existing', url: decision.issueUrl }
  if (decision.status !== 'accepted') return { kind: 'not-accepted' }
  const [{ id: productId, repository }] = await db
    .select({
      id: schema.products.id,
      repository: schema.products.repository,
    })
    .from(schema.products)
    .where(eq(schema.products.slug, productSlug))
  if (!repository) return { kind: 'no-repository' }

  let url: string
  try {
    url = await github.createIssue(repository, toIssue(decision))
  } catch (error) {
    return {
      kind: 'failed',
      message: error instanceof Error ? error.message : String(error),
    }
  }

  await db
    .update(schema.decisions)
    .set({ issueUrl: url })
    .where(
      and(
        eq(schema.decisions.productId, productId),
        eq(schema.decisions.recordId, decisionId),
        isNull(schema.decisions.issueUrl),
      ),
    )
  return { kind: 'created', url }
}
