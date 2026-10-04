import { createFileRoute, notFound } from '@tanstack/react-router'

import { PageState } from '../design-system/page-state.tsx'
import { ConceptScreen } from '../project/concept-screen.tsx'
import { LoadError } from '../project/load-error.tsx'

export const Route = createFileRoute('/_signed-in/$project/$concept/')({
  loader: async ({ context, params }) => {
    const concept = await context.fetchConcept(params)
    if (!concept) throw notFound()
    return concept
  },
  head: ({ loaderData, match, params }) => ({
    meta: [
      {
        title:
          match.status === 'notFound'
            ? `No Concept ${params.concept} | Glue`
            : match.status === 'error'
              ? 'Unable to load the Concept | Glue'
              : loaderData
                ? `${loaderData.title} | Glue`
                : 'Glue',
      },
    ],
  }),
  component: () => <ConceptScreen concept={Route.useLoaderData()} />,
  errorComponent: () => <LoadError name="the Concept" />,
  notFoundComponent: MissingConcept,
})

function MissingConcept() {
  return <PageState title={`No Concept ${Route.useParams().concept}`} />
}
