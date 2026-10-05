import type { DecisionStatus } from '../db/parts.ts'

// A Decision as the gate reads it. `superseded_by` is the id of its
// successor. A superseded Decision with no successor is sunk.
export type GateDecision = {
  status: DecisionStatus
  superseded_by?: string
}

// The newest Contract Version of a Concept. undefined: it has none.
export type NewestContract = {
  concept: string
  newestVersion: number | undefined
}

export function listGateReasons(input: {
  body: string
  decisions: Map<string, GateDecision>
  contract?: NewestContract
}): string[]
