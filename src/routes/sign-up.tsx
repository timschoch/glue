import { createFileRoute, redirect } from '@tanstack/react-router'

import { CredentialsScreen } from '../authentication/credentials-screen.tsx'
import { parseRedirect, toDestination } from '../authentication/redirect.ts'
import { PlainFrame } from '../design-system/frame.tsx'
import { PageSkeleton } from '../design-system/page-state.tsx'
import { LoadError } from '../project/load-error.tsx'

export const Route = createFileRoute('/sign-up')({
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
      <PageSkeleton />
    </PlainFrame>
  ),
  errorComponent: () => (
    <PlainFrame>
      <LoadError name="Glue" />
    </PlainFrame>
  ),
})

function SignUp() {
  const { signUp } = Route.useRouteContext()

  return (
    <CredentialsScreen
      kind="sign-up"
      target={Route.useSearch().redirect}
      submit={signUp}
    />
  )
}
