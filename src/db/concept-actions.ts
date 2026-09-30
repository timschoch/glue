import { redirect } from '@tanstack/react-router'

import type { Failure, Session } from '../authentication/session.ts'
import type { GithubClient } from '../github/client.ts'
import type { ConceptDb } from './client.ts'
import {
  acceptDecision,
  addDecision,
  discardInsight,
  InvalidRecordError,
  keepInsight,
} from './concept-records.ts'
import type { DecisionChange } from './concept-records.ts'
import { findConcept, findRecord, listProducts } from './concept.ts'
import type { ProposalInput, RecordInput } from './decision-proposal.ts'

// A record that breaks a rule is an answer for the person, not an error
// of the server.
async function toFailure(error: unknown): Promise<Failure> {
  if (error instanceof InvalidRecordError) return { message: error.message }
  throw error
}

// A write of a Decision that worked. When GitHub failed, the Decision is
// saved and its downstream issue is missing.
export type SavedDecision = { id: string; issueMissing: boolean }

function toSavedDecision({ id, issue }: DecisionChange): SavedDecision {
  return { id, issueMissing: issue.kind === 'failed' }
}

type Request = {
  findSession: () => Promise<Session | undefined>
  getDb: () => ConceptDb
  getGithub: () => GithubClient
}

// What the server functions of the Concept do. A route guard does not
// protect a server function, thus each action looks for the session first.
// The server functions parse the input. The writes use the record
// functions of the CLI and the HTTP API.
export function createConceptActions({
  findSession,
  getDb,
  getGithub,
}: Request) {
  function withSession<TInput extends unknown[], TResult>(
    run: (db: ConceptDb, ...input: TInput) => Promise<TResult>,
  ) {
    return async (...input: TInput) => {
      if (!(await findSession())) throw redirect({ to: '/sign-in' })
      return run(getDb(), ...input)
    }
  }

  return {
    listProducts: withSession((db) => listProducts(db)),

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
