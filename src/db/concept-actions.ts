import type { z } from 'zod'

import {
  acceptDecision,
  addDecision,
  discardInsight,
  goalChangeSchema,
  keepInsight,
  updateGoal,
} from './concept-records.ts'
import type { DecisionChange } from './concept-records.ts'
import { recordInputSchema } from './decision-proposal.ts'
import type { ProposalInput, RecordInput } from './decision-proposal.ts'
import { findConcept, findRecord } from './legacy-records.ts'
import { listProjects } from './parts.ts'
import { createSessionGuard, toFailure } from './session-actions.ts'
import type { ActionRequest } from './session-actions.ts'

// A person closes a Goal as achieved or opens it again. The app changes the
// status only, with the rule of the HTTP API. The measure stays.
export const goalUpdateInputSchema = recordInputSchema.extend({
  status: goalChangeSchema.shape.status.unwrap(),
})

export type GoalUpdateInput = z.infer<typeof goalUpdateInputSchema>

// A write of a Decision that worked. When GitHub failed, the Decision is
// saved and its downstream issue is missing.
export type SavedDecision = { id: string; issueMissing: boolean }

function toSavedDecision({ id, issue }: DecisionChange): SavedDecision {
  return { id, issueMissing: issue.kind === 'failed' }
}

// What the server functions of the Concept do. Each action looks for the
// session first. The server functions parse the input. The writes use the
// record functions of the CLI and the HTTP API.
export function createConceptActions(request: ActionRequest) {
  const { getGithub } = request
  const withSession = createSessionGuard(request)

  return {
    listProducts: withSession((db) => listProjects(db)),

    findConcept: withSession((db, product: string) => findConcept(db, product)),

    findRecord: withSession((db, { product, recordId }: RecordInput) =>
      findRecord(db, product, recordId),
    ),

    keepInsight: withSession((db, { product, recordId }: RecordInput) =>
      keepInsight(db, product, recordId).then(() => undefined, toFailure),
    ),

    discardInsight: withSession((db, { product, recordId }: RecordInput) =>
      discardInsight(db, product, recordId).then(() => undefined, toFailure),
    ),

    acceptDecision: withSession((db, { product, recordId }: RecordInput) =>
      acceptDecision(db, getGithub(), product, recordId).then(
        toSavedDecision,
        toFailure,
      ),
    ),

    updateGoal: withSession(
      (db, { product, recordId, status }: GoalUpdateInput) =>
        updateGoal(db, product, recordId, { status }).then(
          () => undefined,
          toFailure,
        ),
    ),

    // A new Decision is proposed. One that supersedes a Decision is accepted,
    // and the old one becomes superseded in the same statement.
    proposeDecision: withSession(
      (db, { product, body, ...fields }: ProposalInput) =>
        addDecision(
          db,
          getGithub(),
          product,
          { ...fields, status: fields.supersedes ? 'accepted' : 'proposed' },
          body,
        ).then(toSavedDecision, toFailure),
    ),
  }
}
