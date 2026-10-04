import { createFileRoute, notFound } from '@tanstack/react-router'

import { ConceptScreen } from '../project/concept-screen.tsx'
import { LoadError } from '../project/load-error.tsx'

// The start of a Project: its root Concept. The slug of the root Concept is
// the slug of the Project.
export const Route = createFileRoute('/_signed-in/$project/')({
  loaderDeps: ({ search }) => ({ section: search.section }),
  loader: async ({ context, params: { project }, deps }) => {
    const root = { project, concept: project }
    const state = context.fetchContractState(root)
    const [concept, contract, builds, signals] = await Promise.all([
      context.fetchConcept(root),
      state,
      // The builds come live from GitHub. The section Build lists them, and
      // a Contract shows the ones that name it.
      state.then((found) =>
        deps.section === 'Build' || found?.versions.length
          ? context.fetchBuilds(project)
          : undefined,
      ),
      // The Signals come live from their tool, so only their section reads them.
      deps.section === 'Understand' ? context.fetchSignals(project) : undefined,
    ])
    if (!concept || !contract) throw notFound()
    return { concept, contract, signals, builds }
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
