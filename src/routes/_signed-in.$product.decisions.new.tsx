import { createFileRoute, notFound, redirect } from '@tanstack/react-router'

import { DecisionForm } from '../components/decisions/decision-form.tsx'
import {
  LoadingState,
  MissingRecordState,
  RouteErrorState,
} from '../components/page/page-state.tsx'
import { useAnnouncer } from '../components/page/announcer.tsx'
import { useWrite } from '../components/page/use-write.ts'
import { recordTitleId } from '../components/records/record-sections.ts'
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
  // `evidence` is the Insight or the Guardrail that the Decision starts from.
  // `supersedes` is the Decision that the new Decision replaces.
  validateSearch: (search): { evidence?: string; supersedes?: string } => ({
    evidence: parseId(search.evidence, 'IR'),
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
    // One Decision supersedes a Decision. The record shows which one did.
    if (superseded.status === 'superseded') {
      throw redirect({
        to: '/$product/concept/$recordId',
        params: { product, recordId: superseded.id },
      })
    }
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
  const { announce } = useAnnouncer()
  const propose = useWrite(proposeDecision, async (added) => {
    if (!added) return
    // The form is gone after the save: the title of the new Decision takes
    // the focus.
    announce(
      superseded
        ? `Accepted ${added.id}, superseded ${superseded.id}.`
        : `Proposed ${added.id}.`,
      recordTitleId,
    )
    await navigate({
      to: '/$product/concept/$recordId',
      params: { product, recordId: added.id },
      search: { issue: added.issueMissing ? 'missing' : undefined },
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
      onPropose={(proposal) => propose({ product, ...proposal })}
    />
  )
}

function MissingDecision() {
  return <MissingRecordState recordId={Route.useSearch().supersedes ?? ''} />
}
