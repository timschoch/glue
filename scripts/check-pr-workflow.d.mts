import type { DecisionStatus } from '../src/db/parts.ts'

export type Decision = {
  status: DecisionStatus
  superseded_by?: string
}

export { findContractLine } from '../src/github/pr-body.mjs'
// The newest Contract Version of a Concept. undefined: it has none.
export type NewestContract = {
  concept: string
  newestVersion: number | undefined
}

export function problems(input: {
  body: string
  files: string[]
  decisions: Map<string, Decision>
  contract?: NewestContract
}): string[]

export function isBotBranch(ref: string): boolean
