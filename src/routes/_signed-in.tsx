import {
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'

import { parseRedirect } from '../authentication/redirect.ts'
import { PageFrame, PlainFrame } from '../components/page/page-frame.tsx'
import {
  LoadingState,
  RouteErrorState,
} from '../components/page/page-state.tsx'

// Each route below this one needs a session. This guard is for the pages:
// the server functions that read the Concept check the session themselves.
export const Route = createFileRoute('/_signed-in')({
  beforeLoad: async ({ context, location }) => {
    const session = await context.fetchSession()
    if (!session) {
      throw redirect({
        to: '/sign-in',
        search: { redirect: parseRedirect(location.pathname) },
      })
    }
    return { session }
  },
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
    <PageFrame user={session.user} onSignOut={handleSignOut}>
      <Outlet />
    </PageFrame>
  )
}
