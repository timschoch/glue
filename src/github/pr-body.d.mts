// A Contract Version as a PR body names it: <concept>@<version>.
export type ContractLine = { concept: string; version: number }

export function findDecisionIds(body: string): string[] | undefined

export function findContractLine(body: string): ContractLine | null | undefined
