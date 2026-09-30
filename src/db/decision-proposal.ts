import type { Problems } from '../authentication/credentials.ts'

// A Decision as a person writes it in the app. The server sets the date
// and the status: proposed, or accepted when it supersedes a Decision.
export type DecisionProposal = {
  title: string
  goal: string
  evidence: string[]
  body: string
  owner: string
  supersedes?: string
}

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
