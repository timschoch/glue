import { useRouter } from '@tanstack/react-router'

import type { Build } from '../db/builds.ts'
import { Builds } from '../design-system/builds.tsx'
import { useProjectLinks } from './use-project-links.ts'

// The builds with the addresses of what they name. `reason` says why the
// list is empty.
export function LinkedBuilds({
  builds,
  reason,
}: {
  builds: ReadonlyArray<Build>
  reason?: string | null
}) {
  const router = useRouter()
  const { project, search, recordHref, open } = useProjectLinks()
  const { section, pins } = search

  return (
    <Builds
      builds={builds.map(({ decisions, contract, ...build }) => ({
        ...build,
        decisions: decisions.map((part) => ({
          id: part.id,
          type: part.type,
          title: part.title,
          trust: part.trust,
          workState: part.workState,
          href: recordHref(part),
        })),
        contract: contract && {
          title: contract.title,
          version: contract.version,
          href: router.buildLocation({
            to: '/$project/$concept/contract/$version',
            params: {
              project,
              concept: contract.concept,
              version: String(contract.version),
            },
            search: { section, pins },
          }).href,
        },
      }))}
      reason={reason}
      onOpenPart={({ href }, event) => open(href, event)}
      onOpenContract={({ href }, event) => open(href, event)}
    />
  )
}
