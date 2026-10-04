import { createFileRoute, redirect } from '@tanstack/react-router'

import { parseRedirect, toDestination } from '../authentication/redirect.ts'
import { SignUpForm } from '../components/authentication/credentials-form.tsx'
import { PlainFrame } from '../components/page/page-frame.tsx'
import {
  LoadingState,
  RouteErrorState,
} from '../components/page/page-state.tsx'

export const Route = createFileRoute('/_mantine/sign-up')({
  validateSearch: (search): { redirect?: string } => ({
    redirect: parseRedirect(search.redirect),
  }),
  beforeLoad: async ({ context, search }) => {
    const session = await context.fetchSession()
    if (session) throw redirect(toDestination(search.redirect))
  },
  head: () => ({ meta: [{ title: 'Make an account | Glue' }] }),
  component: SignUp,
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

function SignUp() {
  const { redirect: target } = Route.useSearch()
  const { signUp } = Route.useRouteContext()
  const navigate = Route.useNavigate()

  return (
    <PlainFrame>
      <SignUpForm
        signUp={signUp}
        redirect={target}
        onSignedIn={() => navigate(toDestination(target))}
      />
    </PlainFrame>
  )
}
