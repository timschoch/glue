import {
  Button,
  Checkbox,
  Form,
  FormGroup,
  InlineLoading,
  InlineNotification,
  TextInput,
} from '@carbon/react'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'

import formStyles from './part-form.module.scss'
import { sourceLabels } from './signals.tsx'

export type SignalFilterFormValues = {
  name: string
  // The words that a Signal must hold, each one.
  mustHold: Array<string>
  // The words that a Signal must not hold, not one.
  mustNotHold: Array<string>
  // The names of the Signal sources. None: each source passes.
  sources: Array<string>
}

// The fields that a person types in: each one shows the reason of its wrong
// value.
export const signalFilterFormFields = [
  'name',
  'mustHold',
  'mustNotHold',
] as const
type SignalFilterFormField = (typeof signalFilterFormFields)[number]

export type SignalFilterFormProps = {
  // The filter that the form changes. None: the form adds a filter.
  filter?: {
    [Key in keyof SignalFilterFormValues]: Readonly<SignalFilterFormValues[Key]>
  }
  // The reason of each field with a wrong value.
  errors?: Partial<Record<SignalFilterFormField, string>>
  serverError?: string
  // The write that runs: the form takes no second one.
  pending?: 'Saving' | 'Deleting'
  // Gets the name without the spaces around it.
  onSave: (filter: SignalFilterFormValues) => void
  onCancel: () => void
  // Only a filter that exists can go.
  onDelete?: () => void
}

// A space or a comma ends a word.
const toWords = (text: string) => text.split(/[\s,]+/).filter(Boolean)

// The form of a saved filter of the Signals: its name, the words that a
// Signal must hold and must not hold, and its sources.
export function SignalFilterForm({
  filter,
  errors = {},
  serverError,
  pending,
  onSave,
  onCancel,
  onDelete,
}: SignalFilterFormProps) {
  const formId = useId()
  const [name, setName] = useState(filter?.name ?? '')
  const [mustHold, setMustHold] = useState(filter?.mustHold.join(' ') ?? '')
  const [mustNotHold, setMustNotHold] = useState(
    filter?.mustNotHold.join(' ') ?? '',
  )
  const [sources, setSources] = useState<ReadonlyArray<string>>(
    filter?.sources ?? [],
  )
  const values = {
    name: name.trim(),
    mustHold: toWords(mustHold),
    mustNotHold: toWords(mustNotHold),
    // The order of the form, whatever the order of the clicks.
    sources: Object.keys(sourceLabels).filter((source) =>
      sources.includes(source),
    ),
  }
  // A filter with no word and no source filters nothing.
  const canSave =
    values.name !== '' &&
    values.mustHold.length + values.mustNotHold.length + values.sources.length >
      0
  const isWriting = pending !== undefined

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (canSave && !isWriting) onSave(values)
  }

  return (
    <Form aria-labelledby={formId} className={formStyles.form} onSubmit={save}>
      <h1 id={formId} className={formStyles.typeLine}>
        Filter
      </h1>
      <TextInput
        id={`${formId}-name`}
        labelText="Name"
        invalid={errors.name !== undefined}
        invalidText={errors.name}
        value={name}
        onChange={({ target }) => setName(target.value)}
      />
      <TextInput
        id={`${formId}-must-hold`}
        labelText="Must hold"
        invalid={errors.mustHold !== undefined}
        invalidText={errors.mustHold}
        value={mustHold}
        onChange={({ target }) => setMustHold(target.value)}
      />
      <TextInput
        id={`${formId}-must-not-hold`}
        labelText="Must not hold"
        invalid={errors.mustNotHold !== undefined}
        invalidText={errors.mustNotHold}
        value={mustNotHold}
        onChange={({ target }) => setMustNotHold(target.value)}
      />
      <FormGroup legendText="Sources">
        {Object.entries(sourceLabels).map(([source, label]) => (
          <Checkbox
            key={source}
            id={`${formId}-source-${source}`}
            labelText={label}
            value={source}
            checked={sources.includes(source)}
            onChange={(_, { checked }) =>
              setSources(
                checked
                  ? [...sources, source]
                  : sources.filter((picked) => picked !== source),
              )
            }
          />
        ))}
      </FormGroup>
      {serverError && (
        <InlineNotification
          kind="error"
          role="alert"
          lowContrast
          hideCloseButton
          title={serverError}
        />
      )}
      <div className={formStyles.buttons}>
        {pending === 'Saving' ? (
          <InlineLoading description={pending} className={formStyles.pending} />
        ) : (
          <Button type="submit" disabled={!canSave || isWriting}>
            Save
          </Button>
        )}
        <Button kind="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {onDelete &&
          (pending === 'Deleting' ? (
            <InlineLoading
              description={pending}
              className={formStyles.pending}
            />
          ) : (
            <Button
              kind="danger--ghost"
              disabled={isWriting}
              onClick={onDelete}
            >
              Delete
            </Button>
          ))}
      </div>
    </Form>
  )
}
