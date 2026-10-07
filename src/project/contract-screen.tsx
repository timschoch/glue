import { useRouter } from '@tanstack/react-router'

import type { Build } from '../db/builds.ts'
import type { Contract, ContractState } from '../db/contracts.ts'
import {
  ContractPanel,
  ContractVersionView,
} from '../design-system/contract.tsx'
import { LinkedBuilds } from './linked-builds.tsx'
import { useProjectLinks } from './use-project-links.ts'

// The address of a Contract Version of the open Concept. Without a version:
// the newest one.
export function useVersionHref() {
  const router = useRouter()
  const { project, concept, search } = useProjectLinks()
  const { section, pins } = search

  return (version: number) =>
    router.buildLocation({
      to: '/$project/$concept/contract/$version',
      params: { project, concept, version: String(version) },
      search: { section, pins },
    }).href
}

// The Contract of the open Concept.
// `builds` are the builds that name the Contract.
export function ContractSection({
  contract,
  builds = [],
}: {
  contract: ContractState
  builds?: ReadonlyArray<Build>
}) {
  const { recordHref, open } = useProjectLinks()
  const versionHref = useVersionHref()

  return (
    <ContractPanel
      versions={contract.versions}
      ahead={contract.ahead}
      blocking={contract.blocking.map((part) => ({
        ...part,
        href: recordHref(part),
      }))}
      emptySlots={contract.emptySlots}
      versionHref={versionHref}
      onOpenVersion={(version, event) => open(versionHref(version), event)}
      onOpenPart={(part, event) => open(part.href, event)}
    >
      {builds.length > 0 && <LinkedBuilds builds={builds} />}
    </ContractPanel>
  )
}

// One Contract Version in the main window.
export function ContractVersionScreen({ contract }: { contract: Contract }) {
  const { open } = useProjectLinks()
  const newestHref = useVersionHref()(contract.newestVersion)

  return (
    <ContractVersionView
      contract={contract}
      newestHref={newestHref}
      onOpenNewest={(event) => open(newestHref, event)}
    />
  )
}
