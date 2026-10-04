import { getRouteApi, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import type { Contract, ContractState } from '../db/contracts.ts'
import {
  ContractPanel,
  ContractVersionView,
} from '../design-system/contract.tsx'
import { useProjectLinks } from './use-project-links.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// The address of a Contract Version of the open Concept. Without a version:
// the newest one.
function useVersionHref() {
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

// The Contract of the open Concept, with the sign-off. After a sign-off the
// screen reads the Concept again.
export function ContractSection({ contract }: { contract: ContractState }) {
  const router = useRouter()
  const { signContract } = projectRoute.useRouteContext()
  const { project, concept, recordHref, open } = useProjectLinks()
  const versionHref = useVersionHref()
  const [failure, setFailure] = useState<string>()

  async function signOff() {
    const signed = await signContract({ project, concept })
    setFailure('message' in signed ? signed.message : undefined)
    if ('version' in signed) await router.invalidate()
  }

  return (
    <ContractPanel
      versions={contract.versions}
      ahead={contract.ahead}
      blocking={contract.blocking.map((part) => ({
        ...part,
        href: recordHref(part),
      }))}
      versionHref={versionHref}
      onOpenVersion={(version, event) => open(versionHref(version), event)}
      onOpenPart={(part, event) => open(part.href, event)}
      onSignOff={() => void signOff()}
      failure={failure}
    />
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
