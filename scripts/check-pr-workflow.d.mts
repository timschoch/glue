import type { GateDecision, NewestContract } from '../src/github/pr-gate.mjs'

export type Decision = GateDecision
export type { NewestContract }

export { findContractLine } from '../src/github/pr-body.mjs'

export function problems(input: {
  body: string
  files: string[]
  decisions: Map<string, Decision>
  contract?: NewestContract
  // The Projects of a repository that two or more Projects share.
  projects?: string[]
}): string[]

export function isBotBranch(ref: string): boolean
