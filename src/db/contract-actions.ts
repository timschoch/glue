import { z } from 'zod'

import { findContract, findContractState, signContract } from './contracts.ts'
import { createSessionGuard, toFailure } from './session-actions.ts'
import type { ActionRequest } from './session-actions.ts'

// The input of the server functions of the Contract.
export const contractStateInputSchema = z.object({
  project: z.string(),
  concept: z.string(),
})

export const contractReadInputSchema = contractStateInputSchema.extend({
  version: z.int().positive().optional(),
})

type ContractStateInput = z.infer<typeof contractStateInputSchema>
type ContractReadInput = z.infer<typeof contractReadInputSchema>

// What the server functions of the Contract do. Each action looks for the
// session first. The person of the session signs.
export function createContractActions(
  request: Pick<ActionRequest, 'findSession' | 'getDb'>,
) {
  const { withSession, withMember } = createSessionGuard(request)

  return {
    findContractState: withSession(
      (db, { project, concept }: ContractStateInput) =>
        findContractState(db, project, concept),
    ),

    findContract: withSession(
      (db, { project, concept, version }: ContractReadInput) =>
        findContract(db, project, concept, version),
    ),

    signContract: withMember(
      (db, session, { project, concept }: ContractStateInput) =>
        signContract(db, project, concept, session.user.name).then(
          (version) => ({ version }),
          toFailure,
        ),
    ),
  }
}
