import { createFileRoute, redirect } from '@tanstack/react-router'

import { parseRedirect, toDestination } from '../authentication/redirect.ts'
import { SignInForm } from '../components/authentication/credentials-form.tsx'
import { PlainFrame } from '../components/page/page-frame.tsx'
import {
  LoadingState,
  RouteErrorState,
} from '../components/page/page-state.tsx'

export const Route = createFileRoute('/_mantine/sign-in')({
  validateSearch: (search): { redirect?: string } => ({
    redirect: parseRedirect(search.redirect),
  }),
  beforeLoad: async ({ context, search }) => {
    const session = await context.fetchSession()
    if (session) throw redirect(toDestination(search.redirect))
  },
  head: () => ({ meta: [{ title: 'Sign in | Glue' }] }),
  component: SignIn,
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

function SignIn() {
  const { redirect: target } = Route.useSearch()
  const { signIn } = Route.useRouteContext()
  const navigate = Route.useNavigate()

  return (
    <PlainFrame>
      <SignInForm
        signIn={signIn}
        redirect={target}
        onSignedIn={() => navigate(toDestination(target))}
      />
    </PlainFrame>
  )
}
