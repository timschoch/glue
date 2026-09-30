import { z } from 'zod'

import type { Problems } from '../authentication/credentials.ts'
import { isRecordId } from './record-id.ts'

const text = z.string().trim().min(1)

// A Decision as a person writes it in the app. The server sets the date
// and the status: proposed, or accepted when it supersedes a Decision.
// The HTTP API takes these fields with the same rules, see
// `decisionInputSchema`.
export const proposalSchema = z.object({
  title: text,
  owner: text,
  goal: text,
  evidence: z.array(text).min(1),
  supersedes: text.optional().meta({
    description:
      'The id of the Decision that this one supersedes. The new Decision must be accepted. The old one becomes superseded in the same request.',
  }),
  body: z.string().default(''),
})

export type DecisionProposal = z.infer<typeof proposalSchema>

// What the server functions of the app take. The Product comes with each
// request: the app shows one Product at a time, and each signed-in person
// sees each Product.
export const productInputSchema = z.string().min(1)

export const recordInputSchema = z.object({
  product: productInputSchema,
  recordId: z.string().refine(isRecordId, 'This is not the id of a record.'),
})

export const proposalInputSchema = proposalSchema.extend({
  product: productInputSchema,
})

export type RecordInput = z.infer<typeof recordInputSchema>
export type ProposalInput = z.infer<typeof proposalInputSchema>

export type ProposalField = 'title' | 'goal' | 'evidence' | 'owner'

// The checks of the form, in the order of its fields. The record functions
// check the same rules again on the server.
export function validateProposal(
  proposal: DecisionProposal,
): Problems<ProposalField> {
  return {
    title: proposal.title.trim() ? undefined : 'Enter a title.',
    goal: proposal.goal ? undefined : 'Pick the Goal that the Decision serves.',
    evidence:
      proposal.evidence.length > 0
        ? undefined
        : 'Pick one Insight or Fact or more.',
    owner: proposal.owner.trim()
      ? undefined
      : 'Enter the name of the person who owns the Decision.',
  }
}
