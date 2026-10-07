import { createFileRoute, notFound } from '@tanstack/react-router'

import { isRecordId } from '../db/record-id.ts'
import { PageState } from '../design-system/page-state.tsx'
import { ConceptScreen } from '../project/concept-screen.tsx'
import { LoadError } from '../project/load-error.tsx'

export const Route = createFileRoute('/_signed-in/$project/$concept/')({
  loaderDeps: ({ search: { section, view, panel } }) => ({
    section,
    view,
    panel,
  }),
  loader: async ({ context, params, deps }) => {
    const state = context.fetchContractState(params)
    const isMap = deps.view === 'map'
    const [
      concept,
      contract,
      builds,
      signals,
      signalFilters,
      mapJoints,
      panelPart,
      questions,
    ] = await Promise.all([
      context.fetchConcept(params),
      state,
      // The builds come live from GitHub. The section Build lists the ones
      // of the Project. With no section, a Contract shows the ones that name
      // it.
      state.then((found) =>
        deps.section === 'Build'
          ? context.fetchBuilds(params.project)
          : deps.section === undefined && found?.versions.length
            ? context.fetchBuilds(params.project, { concept: params.concept })
            : undefined,
      ),
      // The Signals come live from their tool, so only their section reads them.
      deps.section === 'Understand'
        ? context.fetchSignals(params.project)
        : undefined,
      deps.section === 'Understand'
        ? context.fetchSignalFilters(params.project)
        : undefined,
      // Only the Map reads the Joints of the Project, and the record of its
      // panel.
      isMap ? context.fetchMapJoints(params.project) : undefined,
      isMap && deps.panel !== undefined && isRecordId(deps.panel)
        ? context.fetchPart({ project: params.project, recordId: deps.panel })
        : undefined,
      // A question is about a Contract Version. They show with the
      // Contract: with no section.
      state.then((found) =>
        deps.section === undefined && found?.versions.length
          ? context.fetchContractQuestions(params)
          : undefined,
      ),
    ])
    if (!concept || !contract) throw notFound()
    return {
      concept,
      contract,
      signals,
      signalFilters,
      builds,
      mapJoints,
      panelPart,
      questions,
    }
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
                ? `${loaderData.concept.title} | Glue`
                : 'Glue',
      },
    ],
  }),
  component: () => <ConceptScreen {...Route.useLoaderData()} />,
  errorComponent: () => <LoadError name="the Concept" />,
  notFoundComponent: MissingConcept,
})

function MissingConcept() {
  return <PageState title={`No Concept ${Route.useParams().concept}`} />
}
