import type { GateDecision, NewestContract } from '../src/github/pr-gate.mjs'

export type Decision = GateDecision
export type { NewestContract }

export { findContractLine } from '../src/github/pr-body.mjs'

export function problems(input: {
  body: string
  files: string[]
  decisions: Map<string, Decision>
  contract?: NewestContract
}): string[]

export function isBotBranch(ref: string): boolean
