import { Subtract } from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  Form,
  InlineLoading,
  InlineNotification,
  TextInput,
} from '@carbon/react'
import { useId, useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'

import { isEvidence, listFormFields } from '../part-fields.ts'
import type { FormField } from '../part-fields.ts'
import { Card, partTypes } from './card.tsx'
import { PartFormBody } from './part-form-body.tsx'
import { FieldRows, StepRows } from './part-form-lists.tsx'
import styles from './part-form.module.scss'
import { PartSearch } from './part-search.tsx'
import type { PartType } from './card.tsx'
import type { FieldValue, StepValue } from './part-form-lists.tsx'
import type { PartFormPart } from './part-search.tsx'

export type { PartFormPart }

export type PartFormValues = {
  title: string
  // Markdown.
  body: string
  metric: string
  source: string
  owner: string
  date: string
  enforcedBy: string
  // The record id of the Goal that a Decision needs.
  goal: string | null
  // The record ids of the Parts that a Decision needs as evidence.
  evidence: ReadonlyArray<string>
  // The steps of a Flow, in their order.
  steps: ReadonlyArray<StepValue>
  // The fields of an Entity.
  fields: ReadonlyArray<FieldValue>
  // A wording fix: the new title or body means the same as the old one.
  sameMeaning: boolean
}

type Field = FormField['name']

const EMPTY: PartFormValues = {
  title: '',
  body: '',
  metric: '',
  source: '',
  owner: '',
  date: '',
  enforcedBy: '',
  goal: null,
  evidence: [],
  steps: [],
  fields: [],
  sameMeaning: false,
}

const hasValue = (value: PartFormValues[Field]) =>
  typeof value === 'string' ? value.trim() !== '' : Boolean(value?.length)

// The format of a date, as the placeholder of its field.
const DATE_FORMAT = 'yyyy-mm-dd'

type OpenHandler = (
  recordId: string,
  event: MouseEvent<HTMLAnchorElement>,
) => void

// The needed Parts of one field: a search over the given Parts, and each
// pick as a minimal card with the one control that removes it. A field that
// holds one pick shows its label in the place of the search while it has it.
function PartPicker({
  id,
  label,
  parts,
  picks,
  single = false,
  invalidText,
  onPick,
  onRemove,
  onOpen,
}: {
  id: string
  label: string
  parts: ReadonlyArray<PartFormPart>
  // The record ids of the picks.
  picks: ReadonlyArray<string>
  single?: boolean
  invalidText?: string
  onPick: (recordId: string) => void
  onRemove: (recordId: string) => void
  onOpen?: OpenHandler
}) {
  const pickedParts = picks.flatMap(
    (pick) => parts.find((part) => part.id === pick) ?? [],
  )

  return (
    <div className={styles.picker}>
      {single && pickedParts.length > 0 && invalidText === undefined ? (
        <span className={styles.pickerLabel}>{label}</span>
      ) : (
        <PartSearch
          id={id}
          label={label}
          parts={parts.filter((part) => !picks.includes(part.id))}
          invalidText={invalidText}
          onPick={onPick}
        />
      )}
      {pickedParts.length > 0 && (
        <ul aria-label={label} className={styles.picks}>
          {pickedParts.map((part) => (
            <li key={part.id}>
              <Card
                minimal
                type={part.type}
                recordId={part.id}
                title={part.title}
                trust={part.trust}
                href={part.href}
                onOpen={onOpen && ((event) => onOpen(part.id, event))}
                action={{
                  label: `Remove ${part.id}`,
                  icon: Subtract,
                  onClick: () => onRemove(part.id),
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// The last row of a form: the one primary button that saves, and the ghost
// button that cancels. While the form saves, the words of the action stand
// in the place of the primary button.
export function SaveButtons({
  canSave,
  pending = false,
  onCancel,
}: {
  canSave: boolean
  pending?: boolean
  onCancel: () => void
}) {
  return (
    <div className={styles.buttons}>
      {pending ? (
        <InlineLoading description="Saving" className={styles.pending} />
      ) : (
        <Button type="submit" disabled={!canSave}>
          Save
        </Button>
      )}
      <Button kind="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}

export type PartFormProps = {
  // The caller gives the Part type. It is not a field.
  type: PartType
  // The record id of the Part that the form edits. None: the form adds a
  // Part. A Part that exists has no field for its Joints, but for its Goal.
  recordId?: string
  // The values that the form starts with.
  values?: Partial<PartFormValues>
  // The Parts that the pickers search.
  parts?: ReadonlyArray<PartFormPart>
  // The reason of each field with a wrong value.
  errors?: Partial<Record<Field, string>>
  serverError?: string
  // The form saves: it takes no second save.
  pending?: boolean
  onSave: (values: PartFormValues) => void
  onCancel: () => void
  // Opens the record of a picked Part.
  onOpen?: OpenHandler
}

// The form that adds or edits one Part: the title, the body, and the fields
// of its Part type.
export function PartForm({
  type,
  recordId,
  values: startValues,
  parts = [],
  errors = {},
  serverError,
  pending = false,
  onSave,
  onCancel,
  onOpen,
}: PartFormProps) {
  const formId = useId()
  const [values, setValues] = useState({ ...EMPTY, ...startValues })
  // A Part that exists changes its Joints on its record. A Decision has
  // one Goal, so the form gives it another one in its place.
  const fields = listFormFields(type).filter(
    ({ name, kind }) =>
      recordId === undefined || kind !== 'joint' || name === 'goal',
  )
  const canSave = fields.every(
    ({ name, required }) => !required || hasValue(values[name]),
  )

  const change = (changed: Partial<PartFormValues>) =>
    setValues((current) => ({ ...current, ...changed }))

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (canSave && !pending) onSave(values)
  }

  const control = ({ name: field, kind, label }: FormField) => {
    const shared = {
      id: `${formId}-${field}`,
      invalid: errors[field] !== undefined,
      invalidText: errors[field],
    }
    switch (field) {
      case 'body':
        return (
          <PartFormBody
            key={field}
            id={shared.id}
            label={label}
            value={values[field]}
            parts={parts.filter((part) => part.id !== recordId)}
            invalidText={errors[field]}
            onChange={(body) => change({ body })}
          />
        )
      case 'goal':
        return (
          <PartPicker
            key={field}
            id={shared.id}
            label={label}
            parts={parts.filter((part) => part.type === 'goal')}
            picks={values.goal === null ? [] : [values.goal]}
            single
            invalidText={errors[field]}
            onPick={(goal) => change({ goal })}
            onRemove={() => change({ goal: null })}
            onOpen={onOpen}
          />
        )
      case 'evidence':
        return (
          <PartPicker
            key={field}
            id={shared.id}
            label={label}
            parts={parts.filter((part) => isEvidence(part.type))}
            picks={values.evidence}
            invalidText={errors[field]}
            onPick={(pick) =>
              setValues((current) => ({
                ...current,
                evidence: [...current.evidence, pick],
              }))
            }
            onRemove={(pick) =>
              setValues((current) => ({
                ...current,
                evidence: current.evidence.filter((id) => id !== pick),
              }))
            }
            onOpen={onOpen}
          />
        )
      case 'steps':
        return (
          <StepRows
            key={field}
            id={shared.id}
            label={label}
            rows={values.steps}
            entities={parts.filter((part) => part.type === 'entity')}
            invalidText={errors[field]}
            onChange={(rows) => change({ steps: rows })}
          />
        )
      case 'fields':
        return (
          <FieldRows
            key={field}
            id={shared.id}
            label={label}
            rows={values.fields}
            invalidText={errors[field]}
            onChange={(rows) => change({ fields: rows })}
          />
        )
      default:
        return (
          <TextInput
            {...shared}
            key={field}
            labelText={label}
            placeholder={kind === 'date' ? DATE_FORMAT : undefined}
            // Carbon names the reason only as the error message of the
            // input. A screen reader needs it as the description too.
            aria-describedby={
              shared.invalid ? `${shared.id}-error-msg` : undefined
            }
            value={values[field]}
            onChange={({ target }) => change({ [field]: target.value })}
          />
        )
    }
  }

  return (
    <Form aria-labelledby={formId} className={styles.form} onSubmit={save}>
      <h1 id={formId} className={styles.typeLine}>
        {recordId ? `${partTypes[type]} ${recordId}` : partTypes[type]}
      </h1>
      {fields.map(control)}
      {recordId !== undefined && (
        <Checkbox
          id={`${formId}-sameMeaning`}
          labelText="Same meaning"
          checked={values.sameMeaning}
          onChange={(_, { checked }) => change({ sameMeaning: checked })}
        />
      )}
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
