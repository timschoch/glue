import { createFileRoute, notFound } from '@tanstack/react-router'

import { DecisionForm } from '../components/decisions/decision-form.tsx'
import {
  LoadingState,
  MissingRecordState,
  RouteErrorState,
} from '../components/page/page-state.tsx'
import { useWrite } from '../components/page/use-write.ts'
import { isRecordId } from '../db/record-id.ts'

// An id from the address, when it is the id of a record of one of the kinds.
function parseId(input: unknown, kinds: string): string | undefined {
  return typeof input === 'string' &&
    isRecordId(input) &&
    kinds.includes(input[0])
    ? input
    : undefined
}

export const Route = createFileRoute('/_signed-in/$product/decisions/new')({
  // `evidence` is the Insight or the Fact that the Decision starts from.
  // `supersedes` is the Decision that the new Decision replaces.
  validateSearch: (search): { evidence?: string; supersedes?: string } => ({
    evidence: parseId(search.evidence, 'IF'),
    supersedes: parseId(search.supersedes, 'D'),
  }),
  loaderDeps: ({ search: { supersedes } }) => ({ supersedes }),
  loader: async ({ context, params: { product }, deps: { supersedes } }) => {
    const [concept, superseded] = await Promise.all([
      context.fetchConcept(product),
      supersedes
        ? context.fetchRecord({ product, recordId: supersedes })
        : undefined,
    ])
    if (!concept) throw notFound()
    if (!supersedes) return { concept }
    if (superseded?.kind !== 'decision') throw notFound()
    return { concept, superseded }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          {
            title: loaderData.superseded
              ? `Supersede ${loaderData.superseded.id} | Glue`
              : 'Propose a Decision | Glue',
          },
        ]
      : [],
  }),
  component: NewDecision,
  pendingComponent: () => <LoadingState name="the form" />,
  errorComponent: () => <RouteErrorState name="the form" />,
  notFoundComponent: MissingDecision,
})

function NewDecision() {
  const { concept, superseded } = Route.useLoaderData()
  const { evidence } = Route.useSearch()
  const { product } = Route.useParams()
  const { session, proposeDecision } = Route.useRouteContext()
  const navigate = Route.useNavigate()
  const propose = useWrite(proposeDecision, async (added) => {
    if (!added) return
    await navigate({
      to: '/$product/concept/$recordId',
      params: { product, recordId: added.id },
    })
  })

  return (
    <DecisionForm
      // A different Decision to supersede is a different form.
      key={superseded?.id}
      concept={concept}
      owner={session.user.name}
      evidence={evidence}
      superseded={superseded}
      submit={(proposal) => propose({ product, ...proposal })}
    />
  )
}

function MissingDecision() {
  return <MissingRecordState recordId={Route.useSearch().supersedes ?? ''} />
}
