import { Outlet, createFileRoute, useRouter } from '@tanstack/react-router'

import { PageFrame, PlainFrame } from '../components/page/page-frame.tsx'
import {
  LoadingState,
  RouteErrorState,
} from '../components/page/page-state.tsx'
import { requireSession } from '../router-context.ts'

// Each Mantine screen below this route needs a session. The frame reads the
// Projects once.
export const Route = createFileRoute('/_mantine/_signed-in')({
  beforeLoad: ({ context, location }) =>
    requireSession(context, location.pathname),
  loader: ({ context }) => context.fetchProjects(),
  staleTime: Infinity,
  component: SignedIn,
  pendingComponent: () => (
    <PlainFrame>
      <LoadingState name="Glue" />
    </PlainFrame>
  ),
  errorComponent: () => (
    <PlainFrame>
      <RouteErrorState name="Glue" />
    </PlainFrame>
  ),
})

function SignedIn() {
  const { session, signOut } = Route.useRouteContext()
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    await router.navigate({ to: '/sign-in' })
  }

  return (
    <PageFrame
      user={session.user}
      products={Route.useLoaderData()}
      onSignOut={handleSignOut}
    >
      <Outlet />
    </PageFrame>
  )
}
