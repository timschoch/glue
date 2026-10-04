import { createFileRoute, notFound, redirect } from '@tanstack/react-router'

import { DecisionForm } from '../components/decisions/decision-form.tsx'
import {
  LoadingState,
  MissingProductState,
  MissingRecordState,
  RouteErrorState,
} from '../components/page/page-state.tsx'
import { useWrite } from '../components/page/use-write.ts'
import { isRecordId } from '../db/record-id.ts'
import { UNKNOWN_CONCEPT } from '../project/project-search.ts'

// An id from the address, when it is the id of a record of one of the kinds.
function parseId(input: unknown, kinds: string): string | undefined {
  return typeof input === 'string' &&
    isRecordId(input) &&
    kinds.includes(input[0])
    ? input
    : undefined
}

// The form reads the model before the Part model. The record it leads to is
// a Carbon screen: that route sends the record to its home Concept.
export const Route = createFileRoute(
  '/_mantine/_signed-in/$project/decisions/new',
)({
  // `evidence` is the Insight or the Guardrail that the Decision starts from.
  // `supersedes` is the Decision that the new Decision replaces.
  validateSearch: (search): { evidence?: string; supersedes?: string } => ({
    evidence: parseId(search.evidence, 'IR'),
    supersedes: parseId(search.supersedes, 'D'),
  }),
  loaderDeps: ({ search: { supersedes } }) => ({ supersedes }),
  loader: async ({ context, params: { project }, deps: { supersedes } }) => {
    const [concept, superseded] = await Promise.all([
      context.fetchProductConcept(project),
      supersedes
        ? context.fetchRecord({ product: project, recordId: supersedes })
        : undefined,
    ])
    if (!concept) throw notFound()
    if (!supersedes) return { concept }
    if (superseded?.kind !== 'decision') throw notFound()
    // One Decision supersedes a Decision. The record shows which one did.
    if (superseded.status === 'superseded') {
      throw redirect({
        to: '/$project/$concept/$recordId',
        params: { project, concept: UNKNOWN_CONCEPT, recordId: superseded.id },
      })
    }
    return { concept, superseded }
  },
  head: ({ loaderData, match, params }) => ({
    meta: [
      {
        title: loaderData
          ? loaderData.superseded
            ? `Supersede ${loaderData.superseded.id} | Glue`
            : 'Propose a Decision | Glue'
          : match.status === 'notFound'
            ? match.search.supersedes
              ? `No record ${match.search.supersedes} | Glue`
              : `No Product ${params.project} | Glue`
            : 'Glue',
      },
    ],
  }),
  component: NewDecision,
  pendingComponent: () => <LoadingState name="the form" />,
  errorComponent: () => <RouteErrorState name="the form" />,
  notFoundComponent: MissingDecision,
})

function NewDecision() {
  const { concept, superseded } = Route.useLoaderData()
  const { evidence } = Route.useSearch()
  const { project } = Route.useParams()
  const { session, proposeDecision } = Route.useRouteContext()
  const navigate = Route.useNavigate()
  const propose = useWrite(proposeDecision, async (added) => {
    if (!added) return
    await navigate({
      to: '/$project/$concept/$recordId',
      params: { project, concept: UNKNOWN_CONCEPT, recordId: added.id },
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
      onPropose={(proposal) => propose({ product: project, ...proposal })}
    />
  )
}

function MissingDecision() {
  const { supersedes } = Route.useSearch()
  const { project } = Route.useParams()

  return supersedes ? (
    <MissingRecordState recordId={supersedes} />
  ) : (
    <MissingProductState product={project} />
  )
}
