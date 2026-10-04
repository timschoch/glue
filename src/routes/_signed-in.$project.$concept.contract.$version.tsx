import { createFileRoute, notFound } from '@tanstack/react-router'

import { PageState } from '../design-system/page-state.tsx'
import { ContractVersionScreen } from '../project/contract-screen.tsx'
import { LoadError } from '../project/load-error.tsx'

const VERSION = /^[1-9]\d*$/

export const Route = createFileRoute(
  '/_signed-in/$project/$concept/contract/$version',
)({
  loader: async ({ context, params: { project, concept, version } }) => {
    // Text that is not a number has no Version. Do not ask the server.
    const contract = VERSION.test(version)
      ? await context.fetchContract({
          project,
          concept,
          version: Number(version),
        })
      : undefined
    if (!contract) throw notFound()
    return contract
  },
  head: ({ loaderData, match, params }) => ({
    meta: [
      {
        title:
          match.status === 'notFound'
            ? `No Contract Version ${params.version} | Glue`
            : match.status === 'error'
              ? 'Unable to load the Contract Version | Glue'
              : loaderData
                ? `${loaderData.title} Version ${loaderData.version} | Glue`
                : 'Glue',
      },
    ],
  }),
  component: () => <ContractVersionScreen contract={Route.useLoaderData()} />,
  errorComponent: () => <LoadError name="the Contract Version" />,
  notFoundComponent: MissingVersion,
})

function MissingVersion() {
  return (
    <PageState title={`No Contract Version ${Route.useParams().version}`} />
  )
}
