import { createFileRoute, notFound } from '@tanstack/react-router'

import { ConceptOverview } from '../components/concept/concept-overview.tsx'
import {
  LoadingState,
  RouteErrorState,
} from '../components/page/page-state.tsx'
import { useWrite } from '../components/page/use-write.ts'

export const Route = createFileRoute('/_signed-in/$product/')({
  loader: async ({ context, params: { product } }) => {
    const concept = await context.fetchConcept(product)
    if (!concept) throw notFound()
    return concept
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: 'Concept | Glue' }] : [],
  }),
  component: Overview,
  pendingComponent: () => <LoadingState name="the Concept" />,
  errorComponent: () => <RouteErrorState name="the Concept" />,
})

function Overview() {
  const { product } = Route.useParams()
  const { keepInsight, discardInsight } = Route.useRouteContext()
  const keep = useWrite(keepInsight)
  const discard = useWrite(discardInsight)

  return (
    <ConceptOverview
      concept={Route.useLoaderData()}
      onKeep={(recordId) => keep({ product, recordId })}
      onDiscard={(recordId) => discard({ product, recordId })}
    />
  )
}
