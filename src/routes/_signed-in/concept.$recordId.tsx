import { createFileRoute, notFound } from '@tanstack/react-router'

import {
  LoadingState,
  MissingRecordState,
  RouteErrorState,
} from '../../components/page/page-state.tsx'
import { RecordView } from '../../components/records/record-view.tsx'
import { isRecordId } from '../../db/record-id.ts'

export const Route = createFileRoute('/_signed-in/concept/$recordId')({
  loader: async ({ context, params: { recordId } }) => {
    // Text that is not an id has no record. Do not ask the server.
    const record = isRecordId(recordId)
      ? await context.fetchRecord(recordId)
      : undefined
    if (!record) throw notFound()
    return record
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
                ? `${loaderData.id} ${loaderData.title} | Glue`
                : 'Glue',
      },
    ],
  }),
  component: ConceptRecord,
  pendingComponent: () => <LoadingState name="the record" />,
  errorComponent: () => <RouteErrorState name="the record" />,
  notFoundComponent: MissingRecord,
})

function ConceptRecord() {
  return <RecordView record={Route.useLoaderData()} />
}

function MissingRecord() {
  return <MissingRecordState recordId={Route.useParams().recordId} />
}
