import { Button, PasswordInput, TextInput, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

import {
  findProblem,
  validateSignIn,
  validateSignUp,
} from '../../authentication/credentials.ts'
import type {
  Problems,
  SignIn,
  SignUp,
} from '../../authentication/credentials.ts'
import type { Failure } from '../../authentication/session.ts'
import classes from './credentials-form.module.css'

type Submit<TValues> = (values: TValues) => Promise<Failure | undefined>

function readText(form: HTMLFormElement, name: keyof SignUp): string {
  const value = new FormData(form).get(name)
  return typeof value === 'string' ? value : ''
}

function focusField(form: HTMLFormElement, name: keyof SignUp) {
  const field = form.elements.namedItem(name)
  if (field instanceof HTMLElement) field.focus()
}

function CredentialsForm({
  title,
  action,
  pendingAction,
  unavailable,
  passwordAutoComplete,
  passwordHint,
  withName = false,
  validate,
  submit,
  onSignedIn,
  children,
}: {
  title: string
  action: string
  pendingAction: string
  unavailable: string
  passwordAutoComplete: 'current-password' | 'new-password'
  passwordHint?: string
  withName?: boolean
  validate: (values: SignUp) => Partial<Problems<keyof SignUp>>
  submit: Submit<SignUp>
  onSignedIn: () => void | Promise<void>
  children: ReactNode
}) {
  const [problems, setProblems] = useState<Partial<Problems<keyof SignUp>>>({})
  const [failure, setFailure] = useState<string>()
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = {
      name: readText(form, 'name'),
      email: readText(form, 'email'),
      password: readText(form, 'password'),
    }

    const found = validate(values)
    setProblems(found)
    setFailure(undefined)
    const first = findProblem(found)
    if (first) {
      focusField(form, first[0])
      return
    }

    setPending(true)
    try {
      const failed = await submit(values)
      if (failed) setFailure(failed.message)
      else await onSignedIn()
    } catch {
      setFailure(unavailable)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={classes.page}>
      <Title order={1}>{title}</Title>
      {/* The checks run on submit and say how to fix a field. When the page
          is not ready, the browser sends the form itself: `post` keeps the
          password out of the address. */}
      <form
        method="post"
        onSubmit={handleSubmit}
        noValidate
        className={classes.form}
      >
        <div role="alert" className={classes.failure}>
          {failure}
        </div>
        {withName && (
          <TextInput
            name="name"
            label="Name"
            size="md"
            autoComplete="name"
            error={problems.name}
          />
        )}
        <TextInput
          name="email"
          type="email"
          label="Email"
          size="md"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          error={problems.email}
        />
        <PasswordInput
          name="password"
          label="Password"
          description={passwordHint}
          size="md"
          autoComplete={passwordAutoComplete}
          error={problems.password}
          // PasswordInput does not mark its field as invalid.
          aria-invalid={problems.password ? true : undefined}
        />
        <Button type="submit" size="md" disabled={pending}>
          {pending ? pendingAction : action}
        </Button>
      </form>
      <p className={classes.other}>{children}</p>
    </div>
  )
}

export function SignInForm({
  signIn,
  onSignedIn,
  redirect,
}: {
  signIn: Submit<SignIn>
  onSignedIn: () => void | Promise<void>
  redirect?: string
}) {
  return (
    <CredentialsForm
      title="Sign in to Glue"
      action="Sign in"
      pendingAction="Signing in"
      unavailable="Sign-in does not work at the moment. Check your connection, then try again."
      passwordAutoComplete="current-password"
      validate={validateSignIn}
      submit={({ email, password }) => signIn({ email, password })}
      onSignedIn={onSignedIn}
    >
      No account yet?{' '}
      <Link to="/sign-up" search={{ redirect }}>
        Make an account
      </Link>
    </CredentialsForm>
  )
}

export function SignUpForm({
  signUp,
  onSignedIn,
  redirect,
}: {
  signUp: Submit<SignUp>
  onSignedIn: () => void | Promise<void>
  redirect?: string
}) {
  return (
    <CredentialsForm
      title="Make an account"
      action="Make account"
      pendingAction="Making the account"
      unavailable="Sign-up does not work at the moment. Check your connection, then try again."
      passwordAutoComplete="new-password"
      passwordHint="8 characters or more"
      withName
      validate={validateSignUp}
      submit={signUp}
      onSignedIn={onSignedIn}
    >
      You have an account?{' '}
      <Link to="/sign-in" search={{ redirect }}>
        Sign in
      </Link>
    </CredentialsForm>
  )
}
