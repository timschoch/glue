import { redirect } from '@tanstack/react-router'
import { z } from 'zod'

import type { Failure, Session } from '../authentication/session.ts'
import type { ConceptDb } from './client.ts'
import {
  acceptDecision,
  addConceptRecord,
  deleteDraftInsight,
  InvalidRecordError,
  keepInsight,
} from './concept-records.ts'
import { findConcept, findRecord, listProducts } from './concept.ts'
import type { DecisionProposal } from './decision-proposal.ts'
import { isRecordId } from './record-id.ts'

// The Product comes with each request: the app shows one Product at a time,
// and each signed-in person sees each Product.
const productSchema = z.string().min(1)
const recordIdSchema = z
  .string()
  .refine(isRecordId, 'This is not the id of a record.')
const recordSchema = z.object({
  product: productSchema,
  recordId: recordIdSchema,
})

const text = z.string().trim()
const proposalSchema = z.object({
  product: productSchema,
  title: text,
  goal: text,
  evidence: z.array(text),
  body: text,
  owner: text,
  supersedes: recordIdSchema.optional(),
}) satisfies z.ZodType<DecisionProposal>

export type RecordInput = z.infer<typeof recordSchema>
export type ProposalInput = z.infer<typeof proposalSchema>

// A record that breaks a rule is an answer for the person, not an error
// of the server.
async function toFailure(error: unknown): Promise<Failure> {
  if (error instanceof InvalidRecordError) return { message: error.message }
  throw error
}

type Request = {
  findSession: () => Promise<Session | undefined>
  getDb: () => ConceptDb
}

// What the server functions of the Concept do. A route guard does not
// protect a server function, thus each action looks for the session first.
// The writes use the record functions of the CLI and the HTTP API.
export function createConceptActions({ findSession, getDb }: Request) {
  function withSession<TInput, TResult>(
    schema: z.ZodType<TInput>,
    run: (db: ConceptDb, input: TInput) => Promise<TResult>,
  ) {
    return async (input: unknown) => {
      if (!(await findSession())) throw redirect({ to: '/sign-in' })
      return run(getDb(), schema.parse(input))
    }
  }

  return {
    listProducts: withSession(z.unknown(), (db) => listProducts(db)),

    findConcept: withSession(productSchema, (db, product) =>
      findConcept(db, product),
    ),

    findRecord: withSession(recordSchema, (db, { product, recordId }) =>
      findRecord(db, product, recordId),
    ),

    keepInsight: withSession(recordSchema, (db, { product, recordId }) =>
      keepInsight(db, product, recordId).then(() => undefined, toFailure),
    ),

    discardInsight: withSession(recordSchema, (db, { product, recordId }) =>
      deleteDraftInsight(db, product, recordId).then(
        () => undefined,
        toFailure,
      ),
    ),

    acceptDecision: withSession(recordSchema, (db, { product, recordId }) =>
      acceptDecision(db, product, recordId).then(() => undefined, toFailure),
    ),

    // A new Decision is proposed. One that supersedes a Decision is accepted,
    // and the old one becomes superseded in the same statement.
    proposeDecision: withSession(
      proposalSchema,
      (db, { product, body, ...fields }) =>
        addConceptRecord(
          db,
          product,
          'decisions',
          { ...fields, status: fields.supersedes ? 'accepted' : 'proposed' },
          body,
        ).then((id) => ({ id }), toFailure),
    ),
  }
}
