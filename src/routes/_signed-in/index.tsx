import { createFileRoute } from '@tanstack/react-router'

import { ConceptOverview } from '../../components/concept/concept-overview.tsx'
import {
  LoadingState,
  RouteErrorState,
} from '../../components/page/page-state.tsx'

export const Route = createFileRoute('/_signed-in/')({
  loader: ({ context }) => context.fetchConcept(),
  head: () => ({ meta: [{ title: 'Concept | Glue' }] }),
  component: Overview,
  pendingComponent: () => <LoadingState name="the Concept" />,
  errorComponent: () => <RouteErrorState name="the Concept" />,
})

function Overview() {
  return <ConceptOverview concept={Route.useLoaderData()} />
}
