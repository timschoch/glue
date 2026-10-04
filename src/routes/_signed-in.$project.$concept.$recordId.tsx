import {
  createFileRoute,
  getRouteApi,
  notFound,
  redirect,
} from '@tanstack/react-router'

import { isRecordId } from '../db/record-id.ts'
import { PageState } from '../design-system/page-state.tsx'
import { LoadError } from '../project/load-error.tsx'
import { RecordScreen } from '../project/record-screen.tsx'

const projectRoute = getRouteApi('/_signed-in/$project')

export const Route = createFileRoute('/_signed-in/$project/$concept/$recordId')(
  {
    loader: async ({ context, params: { project, concept, recordId } }) => {
      // Text that is not an id has no record. Do not ask the server.
      const part = isRecordId(recordId)
        ? await context.fetchPart({ project, recordId })
        : undefined
      if (!part) throw notFound()
      // A record has one address: the one in its home Concept. An address
      // from before the Part model has `concept` in this place.
      if (part.concept !== concept) {
        throw redirect({
          to: '/$project/$concept/$recordId',
          params: { project, concept: part.concept, recordId },
          search: true,
          replace: true,
        })
      }
      // The builds come live from GitHub. Only a Decision has builds that
      // name it.
      const builds =
        part.type === 'decision'
          ? await context.fetchBuilds(project)
          : undefined
      return { part, builds }
    },
    head: ({ loaderData, match, params }) => ({
      meta: [
        {
          title:
            match.status === 'notFound'
              ? `No record ${params.recordId} | Glue`
              : match.status === 'error'
                ? 'Unable to load the record | Glue'
                : loaderData
                  ? `${loaderData.part.id} ${loaderData.part.title} | Glue`
                  : 'Glue',
        },
      ],
    }),
    component: OpenRecord,
    errorComponent: () => <LoadError name="the record" />,
    notFoundComponent: MissingRecord,
  },
)

function OpenRecord() {
  const { parts } = projectRoute.useLoaderData()
  const { part, builds } = Route.useLoaderData()

  return <RecordScreen part={part} parts={parts} builds={builds?.builds} />
}

function MissingRecord() {
  return <PageState title={`No record ${Route.useParams().recordId}`} />
}
