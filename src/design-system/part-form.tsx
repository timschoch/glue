import { Subtract } from '@carbon/icons-react'
import {
  Button,
  Form,
  InlineLoading,
  InlineNotification,
  Select,
  SelectItem,
  TextInput,
} from '@carbon/react'
import { useId, useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'

import { Card, evidenceLevels, partTypes } from './card.tsx'
import { PartFormBody } from './part-form-body.tsx'
import styles from './part-form.module.scss'
import { PartSearch } from './part-search.tsx'
import type { EvidenceLevel, PartType } from './card.tsx'
import type { PartFormPart } from './part-search.tsx'

export type { PartFormPart }

// The Evidence levels of an Insight. A Signal is not an Insight yet.
const insightLevels = [
  'hunch',
  'pattern',
  'confirmed',
] as const satisfies ReadonlyArray<EvidenceLevel>

export type PartFormValues = {
  title: string
  // Markdown.
  body: string
  metric: string
  source: string
  owner: string
  date: string
  evidenceLevel: Exclude<EvidenceLevel, 'signal'> | null
  enforcedBy: string
  // The record id of the Goal that a Decision needs.
  goal: string | null
  // The record ids of the Parts that a Decision needs as evidence.
  evidence: ReadonlyArray<string>
}

type Field = keyof PartFormValues

const EMPTY: PartFormValues = {
  title: '',
  body: '',
  metric: '',
  source: '',
  owner: '',
  date: '',
  evidenceLevel: null,
  enforcedBy: '',
  goal: null,
  evidence: [],
}

const labels: Record<Field, string> = {
  title: 'Title',
  body: 'Body',
  metric: 'Metric',
  source: 'Source',
  owner: 'Owner',
  date: 'Date',
  evidenceLevel: 'Evidence level',
  enforcedBy: 'Enforced by',
  goal: 'Goal',
  evidence: 'Evidence',
}

// The fields that only one Part type has, after the title and the body.
const typeFields: Record<PartType, ReadonlyArray<Field>> = {
  insight: ['source', 'date', 'evidenceLevel'],
  goal: ['metric', 'source'],
  decision: ['owner', 'date', 'goal', 'evidence'],
  guardrail: ['enforcedBy'],
  entity: [],
  flow: [],
  metric: [],
}

// The Joints of a Decision. A Part that exists changes them on its record.
const jointFields = new Set<Field>(['goal', 'evidence'])

// The Part types that the evidence of a Decision offers. The server wants
// one Insight or Guardrail among them.
const evidenceTypes = new Set<PartType>(['insight', 'guardrail', 'decision'])

// A field that a Part can be saved without. Each other field holds a text
// or a pick.
const optionalFields = new Set<Field>(['body', 'evidenceLevel'])

const hasValue = (value: PartFormValues[Field]) =>
  typeof value === 'string' ? value.trim() !== '' : Boolean(value?.length)

// The format of a field, as its placeholder.
const placeholders: Partial<Record<Field, string>> = { date: 'yyyy-mm-dd' }

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
  // Part. A Part that exists has no field for its Joints.
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
  const fields: ReadonlyArray<Field> = [
    'title',
    'body',
    ...typeFields[type].filter(
      (field) => recordId === undefined || !jointFields.has(field),
    ),
  ]
  const canSave = fields.every(
    (field) => optionalFields.has(field) || hasValue(values[field]),
  )

  const change = (changed: Partial<PartFormValues>) =>
    setValues((current) => ({ ...current, ...changed }))

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (canSave && !pending) onSave(values)
  }

  const control = (field: Field) => {
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
            label={labels[field]}
            value={values[field]}
            parts={parts.filter((part) => part.id !== recordId)}
            invalidText={errors[field]}
            onChange={(body) => change({ body })}
          />
        )
      case 'evidenceLevel':
        return (
          <Select
            {...shared}
            key={field}
            labelText={labels[field]}
            value={values[field] ?? ''}
            onChange={({ target }) =>
              change({
                evidenceLevel:
                  insightLevels.find((level) => level === target.value) ?? null,
              })
            }
          >
            <SelectItem value="" text="" />
            {insightLevels.map((level) => (
              <SelectItem
                key={level}
                value={level}
                text={evidenceLevels[level]}
              />
            ))}
          </Select>
        )
      case 'goal':
        return (
          <PartPicker
            key={field}
            id={shared.id}
            label={labels[field]}
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
            label={labels[field]}
            parts={parts.filter((part) => evidenceTypes.has(part.type))}
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
      default:
        return (
          <TextInput
            {...shared}
            key={field}
            labelText={labels[field]}
            placeholder={placeholders[field]}
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
