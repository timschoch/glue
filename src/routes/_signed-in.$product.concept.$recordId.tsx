import { createFileRoute, notFound, useRouter } from '@tanstack/react-router'

import {
  LoadingState,
  MissingRecordState,
  RouteErrorState,
} from '../components/page/page-state.tsx'
import { useWrite } from '../components/page/use-write.ts'
import { RecordView } from '../components/records/record-view.tsx'
import { isRecordId } from '../db/record-id.ts'

export const Route = createFileRoute('/_signed-in/$product/concept/$recordId')({
  // `issue=missing`: the Decision was accepted a moment ago, and GitHub did
  // not open its issue.
  validateSearch: (search): { issue?: 'missing' } => ({
    issue: search.issue === 'missing' ? 'missing' : undefined,
  }),
  loader: async ({ context, params }) => {
    // Text that is not an id has no record. Do not ask the server.
    const record = isRecordId(params.recordId)
      ? await context.fetchRecord(params)
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
  const params = Route.useParams()
  const { keepInsight, discardInsight, acceptDecision, updateGoal } =
    Route.useRouteContext()
  const { issue } = Route.useSearch()
  const router = useRouter()
  const navigate = Route.useNavigate()
  const keep = useWrite(keepInsight)
  const update = useWrite(updateGoal)
  // The page loads again and shows the new state, with a note when the
  // issue is missing.
  const accept = useWrite(acceptDecision, async (accepted) => {
    if (accepted?.issueMissing) {
      await navigate({ search: { issue: 'missing' }, replace: true })
    }
    await router.invalidate()
  })
  // The page of a discarded Insight is gone: go to the other Insights.
  const discard = useWrite(discardInsight, () =>
    navigate({ to: '/$product', params, hash: 'insights' }),
  )

  return (
    <RecordView
      record={Route.useLoaderData()}
      issueMissing={issue === 'missing'}
      onKeep={() => keep(params)}
      onDiscard={() => discard(params)}
      onAccept={() => accept(params)}
      onClose={() => update({ ...params, status: 'achieved' })}
      onReopen={() => update({ ...params, status: 'open' })}
    />
  )
}

function MissingRecord() {
  return <MissingRecordState recordId={Route.useParams().recordId} />
}
