import { createFileRoute, notFound } from '@tanstack/react-router'

import { ConceptScreen } from '../project/concept-screen.tsx'
import { LoadError } from '../project/load-error.tsx'

// The start of a Project: its root Concept. The slug of the root Concept is
// the slug of the Project.
export const Route = createFileRoute('/_signed-in/$project/')({
  loaderDeps: ({ search }) => ({ section: search.section }),
  loader: async ({ context, params: { project }, deps }) => {
    const [concept, signals] = await Promise.all([
      context.fetchConcept({ project, concept: project }),
      // The Signals come live from their tool, so only their section reads them.
      deps.section === 'Understand' ? context.fetchSignals(project) : undefined,
    ])
    if (!concept) throw notFound()
    return { concept, signals }
  },
  head: ({ match }) => ({
    meta:
      match.status === 'error'
        ? [{ title: 'Unable to load the Concept | Glue' }]
        : [],
  }),
  component: () => <ConceptScreen {...Route.useLoaderData()} />,
  errorComponent: () => <LoadError name="the Concept" />,
})
