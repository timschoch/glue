import { Form, InlineNotification, TextInput } from '@carbon/react'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'

import { SaveButtons } from './part-form.tsx'
import styles from './part-form.module.scss'

export type NameFormProps = {
  // What the form adds, for example Concept.
  heading: string
  // The label of the one field.
  label: string
  // The format of the field.
  placeholder?: string
  // The reason of a wrong value.
  error?: string
  serverError?: string
  // The form saves: it takes no second save.
  pending?: boolean
  // Gets the value without the spaces around it.
  onSave: (value: string) => void
  onCancel: () => void
}

// The form that adds a thing with one field: a Concept by its title, a
// Project by its slug. It looks like the Part form.
export function NameForm({
  heading,
  label,
  placeholder,
  error,
  serverError,
  pending = false,
  onSave,
  onCancel,
}: NameFormProps) {
  const formId = useId()
  const fieldId = `${formId}-field`
  const [value, setValue] = useState('')
  const name = value.trim()
  const canSave = name !== ''

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (canSave && !pending) onSave(name)
  }

  return (
    <Form aria-labelledby={formId} className={styles.form} onSubmit={save}>
      <h1 id={formId} className={styles.typeLine}>
        {heading}
      </h1>
      <TextInput
        id={fieldId}
        labelText={label}
        placeholder={placeholder}
        invalid={error !== undefined}
        invalidText={error}
        // Carbon names the reason only as the error message of the input. A
        // screen reader needs it as the description too.
        aria-describedby={
          error === undefined ? undefined : `${fieldId}-error-msg`
        }
        value={value}
        onChange={({ target }) => setValue(target.value)}
      />
      {serverError && (
        <InlineNotification
          kind="error"
          role="alert"
          lowContrast
          hideCloseButton
          title={serverError}
        />
      )}
      <SaveButtons canSave={canSave} pending={pending} onCancel={onCancel} />
    </Form>
  )
}
