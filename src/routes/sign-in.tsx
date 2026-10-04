import { createFileRoute, redirect } from '@tanstack/react-router'

import { CredentialsScreen } from '../authentication/credentials-screen.tsx'
import { parseRedirect, toDestination } from '../authentication/redirect.ts'
import { PlainFrame } from '../design-system/frame.tsx'
import { PageSkeleton } from '../design-system/page-state.tsx'
import { LoadError } from '../project/load-error.tsx'

export const Route = createFileRoute('/sign-in')({
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
      <PageSkeleton />
    </PlainFrame>
  ),
  errorComponent: () => (
    <PlainFrame>
      <LoadError name="Glue" />
    </PlainFrame>
  ),
})

function SignIn() {
  const { signIn } = Route.useRouteContext()

  return (
    <CredentialsScreen
      kind="sign-in"
      target={Route.useSearch().redirect}
      submit={({ email, password }) => signIn({ email, password })}
    />
  )
}
