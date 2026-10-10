import {
  Outlet,
  createFileRoute,
  getRouteApi,
  notFound,
} from '@tanstack/react-router'

import { PlainFrame } from '../design-system/frame.tsx'
import { PageState } from '../design-system/page-state.tsx'
import { LoadError } from '../project/load-error.tsx'
import { ProjectFrame } from '../project/project-frame.tsx'
import { parseProjectSearch } from '../project/project-search.ts'

const signedIn = getRouteApi('/_signed-in')

// Each screen of a Project is below this route. It reads the tree of the
// Concepts for the left panel, the Parts for the titles of the trail, of
// the pins and of the record ids in a text, the Parts, the Asks, the open
// questions and the failed Integrations of Mine, the count of the new flags,
// the Parts that the person watches, the readings of Use and the people of
// the Project.
export const Route = createFileRoute('/_signed-in/$project')({
  validateSearch: parseProjectSearch,
  loader: async ({ context, params }) => {
    const [
      project,
      parts,
      mine,
      newFlagCount,
      asks,
      watched,
      measured,
      people,
      questions,
      failedIntegrations,
    ] = await Promise.all([
      context.fetchProject(params.project),
      context.fetchParts(params.project),
      context.fetchMine(params.project),
      context.fetchNewFlagCount(params.project),
      context.fetchMineAsks(params.project),
      context.fetchWatched(params.project),
      context.fetchMeasured(params.project),
      context.fetchPeople(params.project),
      context.fetchMineContractQuestions(params.project),
      context.fetchMineIntegrations(params.project),
    ])
    if (!project) throw notFound()
    return {
      project,
      parts,
      mine,
      newFlagCount,
      asks,
      watched,
      measured,
      people,
      questions,
      failedIntegrations,
    }
  },
  head: ({ match, params, loaderData }) => ({
    meta: [
      {
        title:
          match.status === 'notFound'
            ? `No Project ${params.project} | Glue`
            : match.status === 'error'
              ? 'Unable to load the Project | Glue'
              : loaderData
                ? `${loaderData.project.name} | Glue`
                : 'Glue',
      },
    ],
  }),
  component: ProjectScreens,
  errorComponent: () => (
    <PlainFrame>
      <LoadError name="the Project" />
    </PlainFrame>
  ),
  notFoundComponent: MissingProject,
})

function ProjectScreens() {
  const { project, parts, newFlagCount } = Route.useLoaderData()

  return (
    <ProjectFrame
      project={project}
      projects={signedIn.useLoaderData()}
      parts={parts}
      newFlagCount={newFlagCount}
    >
      <Outlet />
    </ProjectFrame>
  )
}

function MissingProject() {
  return (
    <PlainFrame>
      <PageState
        title={`No Project ${Route.useParams().project}`}
        link={{ name: 'Glue', href: '/' }}
      />
    </PlainFrame>
  )
}
