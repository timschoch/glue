import type { DecisionStatus } from '../src/db/concept-fields.ts'

export type Decision = {
  status: DecisionStatus
  superseded_by?: string
}

// A Contract Version as a PR body names it: <concept>@<version>.
export type ContractLine = { concept: string; version: number }

// The newest Contract Version of a Concept. undefined: it has none.
export type NewestContract = {
  concept: string
  newestVersion: number | undefined
}

export function findContractLine(body: string): ContractLine | null | undefined

export function problems(input: {
  body: string
  files: string[]
  decisions: Map<string, Decision>
  contract?: NewestContract
}): string[]

export function isBotBranch(ref: string): boolean
