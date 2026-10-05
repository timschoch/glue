import { createFileRoute, notFound } from '@tanstack/react-router'

import { isRecordId } from '../db/record-id.ts'
import { ConceptScreen } from '../project/concept-screen.tsx'
import { LoadError } from '../project/load-error.tsx'

// The start of a Project: its root Concept. The slug of the root Concept is
// the slug of the Project.
export const Route = createFileRoute('/_signed-in/$project/')({
  loaderDeps: ({ search: { section, view, panel } }) => ({
    section,
    view,
    panel,
  }),
  loader: async ({ context, params: { project }, deps }) => {
    const root = { project, concept: project }
    const state = context.fetchContractState(root)
    const isMap = deps.view === 'map'
    const [concept, contract, builds, signals, mapJoints, panelPart] =
      await Promise.all([
        context.fetchConcept(root),
        state,
        // The builds come live from GitHub. The section Build lists the ones
        // of the Project. With no section, a Contract shows the ones that name
        // it.
        state.then((found) =>
          deps.section === 'Build'
            ? context.fetchBuilds(project)
            : deps.section === undefined && found?.versions.length
              ? context.fetchBuilds(project, { concept: project })
              : undefined,
        ),
        // The Signals come live from their tool, so only their section reads them.
        deps.section === 'Understand'
          ? context.fetchSignals(project)
          : undefined,
        // Only the Map reads the Joints of the Project, and the record of its
        // panel.
        isMap ? context.fetchMapJoints(project) : undefined,
        isMap && deps.panel !== undefined && isRecordId(deps.panel)
          ? context.fetchPart({ project, recordId: deps.panel })
          : undefined,
      ])
    if (!concept || !contract) throw notFound()
    return { concept, contract, signals, builds, mapJoints, panelPart }
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
