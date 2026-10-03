import {
  Button,
  ComboBox,
  Form,
  InlineNotification,
  Select,
  SelectItem,
  TextArea,
  TextInput,
} from '@carbon/react'
import { useId, useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'

import { Card } from './card.tsx'
import styles from './part-form.module.scss'
import type { EvidenceLevel, PartType, Trust } from './card.tsx'

const partTypes = {
  insight: 'Insight',
  goal: 'Goal',
  decision: 'Decision',
  guardrail: 'Guardrail',
  entity: 'Entity',
  flow: 'Flow',
  metric: 'Metric',
} as const

// The Evidence levels of an Insight. A Signal is not an Insight yet.
const evidenceLevels = [
  ['hunch', 'Hunch'],
  ['pattern', 'Pattern'],
  ['confirmed', 'Confirmed'],
] as const

// A Part that a picker offers, with what its minimal card shows.
export type PartFormPart = {
  // The record id, for example G2.
  id: string
  type: PartType
  title: string
  trust: Trust
  href: string
}

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

// A field that a Part can be saved without. Each other field holds a text.
const optionalFields = new Set<Field>(['body', 'evidenceLevel', 'evidence'])

const hasText = (value: PartFormValues[Field]) =>
  typeof value === 'string' && value.trim() !== ''

// The format of a field, as its placeholder.
const placeholders: Partial<Record<Field, string>> = { date: 'yyyy-mm-dd' }

type OpenHandler = (
  recordId: string,
  event: MouseEvent<HTMLAnchorElement>,
) => void

// The field holds the search only. The picks are the cards below it.
const searchText = () => ''

function PartOption({ id, title }: PartFormPart) {
  return `${id} ${title}`
}

function matchesSearch({ id, title }: PartFormPart, search: string) {
  const words = search.trim().toLowerCase()
  return id.toLowerCase().includes(words) || title.toLowerCase().includes(words)
}

// The needed Parts of one field: a search over the given Parts, and each
// pick as a minimal card with the one control that removes it.
function PartPicker({
  id,
  label,
  parts,
  picks,
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
      <ComboBox
        id={id}
        titleText={label}
        items={parts.filter((part) => !picks.includes(part.id))}
        itemToString={searchText}
        itemToElement={PartOption}
        shouldFilterItem={({ item, inputValue }) =>
          matchesSearch(item, inputValue ?? '')
        }
        // No pick stays in the field, so the same Part can be picked again.
        downshiftProps={{ selectedItem: null }}
        onChange={({ selectedItem }) => {
          if (selectedItem) onPick(selectedItem.id)
        }}
        invalid={invalidText !== undefined}
        invalidText={invalidText}
      />
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
                action={{ label: 'Remove', onClick: () => onRemove(part.id) }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export type PartFormProps = {
  // The caller gives the Part type. It is not a field.
  type: PartType
  // The record id of the Part that the form edits. None: the form adds a Part.
  recordId?: string
  // The values that the form starts with.
  values?: Partial<PartFormValues>
  // The Parts that the pickers search.
  parts?: ReadonlyArray<PartFormPart>
  // The reason of each field with a wrong value.
  errors?: Partial<Record<Field, string>>
  serverError?: string
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
  onSave,
  onCancel,
  onOpen,
}: PartFormProps) {
  const formId = useId()
  const [values, setValues] = useState({ ...EMPTY, ...startValues })
  const fields: ReadonlyArray<Field> = ['title', 'body', ...typeFields[type]]
  const canSave = fields.every(
    (field) => optionalFields.has(field) || hasText(values[field]),
  )

  const change = (changed: Partial<PartFormValues>) =>
    setValues((current) => ({ ...current, ...changed }))

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (canSave) onSave(values)
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
          <TextArea
            {...shared}
            key={field}
            labelText={labels[field]}
            value={values[field]}
            onChange={({ target }) => change({ [field]: target.value })}
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
                  evidenceLevels.find(
                    ([level]) => level === target.value,
                  )?.[0] ?? null,
              })
            }
          >
            <SelectItem value="" text="" />
            {evidenceLevels.map(([level, word]) => (
              <SelectItem key={level} value={level} text={word} />
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
            parts={parts.filter((part) => part.type === 'insight')}
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
      <div className={styles.buttons}>
        <Button type="submit" disabled={!canSave}>
          Save
        </Button>
        <Button kind="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Form>
  )
}
