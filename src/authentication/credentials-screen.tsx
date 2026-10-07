import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { CredentialsForm } from '../design-system/credentials-form.tsx'
import type { CredentialsValues } from '../design-system/credentials-form.tsx'
import { PlainFrame } from '../design-system/frame.tsx'
import { isForBrowser } from '../project/use-project-links.ts'
import { useWrite } from '../project/use-write.ts'
import type { Write } from '../project/use-write.ts'
import { findProblem, validateSignIn, validateSignUp } from './credentials.ts'
import type { Problems } from './credentials.ts'
import { toDestination } from './redirect.ts'
import type { Failure } from './session.ts'

const screens = {
  'sign-in': {
    title: 'Sign in to Glue',
    action: 'Sign in',
    pendingAction: 'Signing in',
    unavailable:
      'Sign-in does not work at the moment. Check your connection, then try again.',
    withName: false,
    passwordAutoComplete: 'current-password',
    passwordPlaceholder: undefined,
    validate: validateSignIn,
    other: { name: 'Make an account', to: '/sign-up' },
  },
  'sign-up': {
    title: 'Make an account',
    action: 'Make account',
    pendingAction: 'Making the account',
    unavailable:
      'Sign-up does not work at the moment. Check your connection, then try again.',
    withName: true,
    passwordAutoComplete: 'new-password',
    passwordPlaceholder: '8 characters or more',
    validate: validateSignUp,
    other: { name: 'Sign in', to: '/sign-in' },
  },
} as const

// The page of sign-in or of sign-up. It checks the values, sends them, and
// opens the target of the redirect after the session starts.
export function CredentialsScreen({
  kind,
  target,
  submit,
}: {
  kind: keyof typeof screens
  // The page to show after sign-in.
  target?: string
  submit: (values: CredentialsValues) => Write<Failure | undefined>
}) {
  const router = useRouter()
  const [problems, setProblems] =
    useState<Partial<Problems<keyof CredentialsValues>>>()
  const { validate, unavailable, other, ...words } = screens[kind]
  const { pending, failure, write } = useWrite(unavailable)

  function handleSubmit(values: CredentialsValues) {
    const found = validate(values)
    setProblems(found)
    if (findProblem(found)) return

    void write(
      words.pendingAction,
      () => submit(values),
      () => router.navigate(toDestination(target)),
    )
  }

  return (
    <PlainFrame>
      <CredentialsForm
        {...words}
        problems={problems}
        failure={failure}
        pending={pending !== undefined}
        onSubmit={handleSubmit}
        other={{
          name: other.name,
          href: router.buildLocation({
            to: other.to,
            search: { redirect: target },
          }).href,
        }}
        onOpen={(href, event) => {
          if (isForBrowser(event)) return
          event.preventDefault()
          void router.navigate({ href })
        }}
      />
    </PlainFrame>
  )
}
