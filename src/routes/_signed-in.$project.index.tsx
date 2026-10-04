import { createFileRoute, notFound } from '@tanstack/react-router'

import { ConceptScreen } from '../project/concept-screen.tsx'
import { LoadError } from '../project/load-error.tsx'

// The start of a Project: its root Concept. The slug of the root Concept is
// the slug of the Project.
export const Route = createFileRoute('/_signed-in/$project/')({
  loader: async ({ context, params: { project } }) => {
    const concept = await context.fetchConcept({ project, concept: project })
    if (!concept) throw notFound()
    return concept
  },
  head: ({ match }) => ({
    meta:
      match.status === 'error'
        ? [{ title: 'Unable to load the Concept | Glue' }]
        : [],
  }),
  component: () => <ConceptScreen concept={Route.useLoaderData()} />,
  errorComponent: () => <LoadError name="the Concept" />,
})
