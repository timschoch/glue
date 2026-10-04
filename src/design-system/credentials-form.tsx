import {
  Button,
  Form,
  InlineLoading,
  InlineNotification,
  Link,
  PasswordInput,
  TextInput,
} from '@carbon/react'
import { useEffect, useId } from 'react'
import type { FormEvent, MouseEvent } from 'react'

import styles from './credentials-form.module.scss'
import { useHydrated } from './use-hydrated.ts'

export type CredentialsValues = {
  name: string
  email: string
  password: string
}

type Field = keyof CredentialsValues

// The fields in the order of the form.
const fieldNames = [
  'name',
  'email',
  'password',
] as const satisfies ReadonlyArray<Field>

export type CredentialsFormProps = {
  // The page title, for example Sign in to Glue.
  title: string
  // The words of the submit button, for example Sign in.
  action: string
  // The words of the running action, for example Signing in.
  pendingAction: string
  // Sign-up has a field for the name.
  withName?: boolean
  passwordAutoComplete: 'current-password' | 'new-password'
  // The format of the password.
  passwordPlaceholder?: string
  // The reason of each wrong field.
  problems?: Partial<Record<Field, string>>
  // Why the server did not take the values.
  failure?: string
  // The form submits: it takes no second submit.
  pending?: boolean
  onSubmit: (values: CredentialsValues) => void
  // The link to the other page: sign-up on sign-in, sign-in on sign-up.
  other: { name: string; href: string }
  // A click on the link, with its address.
  onOpen?: (href: string, event: MouseEvent<HTMLAnchorElement>) => void
}

// The form of sign-in and of sign-up: the email, the password, and the name
// on sign-up. The caller checks the values and gives the problems back.
export function CredentialsForm({
  title,
  action,
  pendingAction,
  withName = false,
  passwordAutoComplete,
  passwordPlaceholder,
  problems,
  failure,
  pending = false,
  onSubmit,
  other,
  onOpen,
}: CredentialsFormProps) {
  const formId = useId()
  const hydrated = useHydrated()

  // New problems: the focus goes to the first wrong field of the form.
  useEffect(() => {
    fieldNames
      .map((name) =>
        problems?.[name] === undefined
          ? null
          : document.getElementById(`${formId}-${name}`),
      )
      .find((input) => input !== null)
      ?.focus()
  }, [problems, formId])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    const values = new FormData(event.currentTarget)
    const text = (name: Field) => {
      const value = values.get(name)
      return typeof value === 'string' ? value : ''
    }
    onSubmit({
      name: text('name'),
      email: text('email'),
      password: text('password'),
    })
  }

  const field = (name: Field) => {
    const id = `${formId}-${name}`
    const problem = problems?.[name]
    return {
      id,
      name,
      invalid: problem !== undefined,
      invalidText: problem,
      // Carbon names the reason only as the error message of the input. A
      // screen reader needs it as the description too.
      'aria-describedby': problem === undefined ? undefined : `${id}-error-msg`,
    }
  }

  return (
    <div className={styles.page}>
      <h1 id={formId} className={styles.title}>
        {title}
      </h1>
      {/* The caller checks the values, so the browser does not. When the
          page is not hydrated, the browser would send the form itself and
          load the page again with empty fields. So the button waits for the
          page, and the fields keep what was typed. If a browser sends the
          form all the same, `post` keeps the password out of the address. */}
      <Form
        method="post"
        noValidate
        aria-labelledby={formId}
        className={styles.form}
        onSubmit={submit}
      >
        {withName && (
          <TextInput {...field('name')} labelText="Name" autoComplete="name" />
        )}
        <TextInput
          {...field('email')}
          type="email"
          labelText="Email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
        />
        <PasswordInput
          {...field('password')}
          labelText="Password"
          placeholder={passwordPlaceholder}
          autoComplete={passwordAutoComplete}
        />
        {failure && (
          <InlineNotification
            kind="error"
            role="alert"
            lowContrast
            hideCloseButton
            title={failure}
          />
        )}
        {pending ? (
          <InlineLoading description={pendingAction} />
        ) : (
          <Button type="submit" disabled={!hydrated} className={styles.submit}>
            {action}
          </Button>
        )}
      </Form>
      <Link
        href={other.href}
        className={styles.other}
        onClick={(event) => onOpen?.(other.href, event)}
      >
        {other.name}
      </Link>
    </div>
  )
}
