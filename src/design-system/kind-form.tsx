import {
  Form,
  FormGroup,
  InlineNotification,
  NumberInput,
  Select,
  SelectItem,
  TextInput,
} from '@carbon/react'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'

import { partTypes } from './card.tsx'
import type { PartType } from './card.tsx'
import { typeGroups } from './concept-view.tsx'
import { SaveButtons } from './part-form.tsx'
import styles from './kind-form.module.scss'
import formStyles from './part-form.module.scss'

export type KindFormSlot = {
  type: PartType
  required: boolean
  // The least count of Parts that fill the slot.
  minCount: number
}

export type KindFormValues = { name: string; slots: Array<KindFormSlot> }

export type KindFormProps = {
  // The Kind that the form changes. None: the form adds a Kind.
  kind?: KindFormValues
  // The reason of a wrong name.
  error?: string
  serverError?: string
  // The form saves: it takes no second save.
  pending?: boolean
  // Gets the name without the spaces around it, and the slots in the order
  // of the loop.
  onSave: (kind: KindFormValues) => void
  onCancel: () => void
}

// What a Kind says about one Part type.
const slotStates = {
  none: 'No slot',
  optional: 'Optional',
  required: 'Required',
}

type SlotState = keyof typeof slotStates

function isSlotState(value: string): value is SlotState {
  return Object.hasOwn(slotStates, value)
}

// A slot as the form holds it: its count field can be empty.
type SlotValues = Omit<KindFormSlot, 'minCount'> & { minCount: number | '' }

function isCount(minCount: number | ''): minCount is number {
  return Number.isInteger(minCount) && Number(minCount) >= 1
}

// The form of a Kind: its name, and for each Part type if the Kind has a
// slot of it, if the slot is required, and its least count of Parts.
export function KindForm({
  kind,
  error,
  serverError,
  pending = false,
  onSave,
  onCancel,
}: KindFormProps) {
  const formId = useId()
  const [name, setName] = useState(kind?.name ?? '')
  const [slots, setSlots] = useState<ReadonlyArray<SlotValues>>(
    kind?.slots ?? [],
  )
  const canSave =
    name.trim() !== '' && slots.every(({ minCount }) => isCount(minCount))

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!canSave || pending) return
    onSave({
      name: name.trim(),
      slots: typeGroups.flatMap(({ type }) =>
        slots.flatMap((slot) =>
          slot.type === type && isCount(slot.minCount)
            ? [{ type, required: slot.required, minCount: slot.minCount }]
            : [],
        ),
      ),
    })
  }

  function setState(type: PartType, state: SlotState) {
    const others = slots.filter((slot) => slot.type !== type)
    const minCount = slots.find((slot) => slot.type === type)?.minCount ?? 1
    setSlots(
      state === 'none'
        ? others
        : [...others, { type, required: state === 'required', minCount }],
    )
  }

  function setMinCount(type: PartType, minCount: number | '') {
    setSlots(
      slots.map((slot) => (slot.type === type ? { ...slot, minCount } : slot)),
    )
  }

  return (
    <Form aria-labelledby={formId} className={formStyles.form} onSubmit={save}>
      <h1 id={formId} className={formStyles.typeLine}>
        Kind
      </h1>
      <TextInput
        id={`${formId}-name`}
        labelText="Name"
        invalid={error !== undefined}
        invalidText={error}
        value={name}
        onChange={({ target }) => setName(target.value)}
      />
      {typeGroups.map(({ type }) => {
        const slot = slots.find((found) => found.type === type)
        const state = !slot ? 'none' : slot.required ? 'required' : 'optional'

        return (
          <FormGroup
            key={type}
            legendText={partTypes[type]}
            className={styles.slot}
          >
            <Select
              id={`${formId}-slot-${type}`}
              labelText="Slot"
              value={state}
              onChange={({ target }) => {
                if (isSlotState(target.value)) setState(type, target.value)
              }}
            >
              {Object.entries(slotStates).map(([value, text]) => (
                <SelectItem key={value} value={value} text={text} />
              ))}
            </Select>
            {slot && (
              <NumberInput
                id={`${formId}-count-${type}`}
                label="At least"
                min={1}
                invalidText="Enter a count of 1 or more."
                value={slot.minCount}
                onChange={(_event, { value }) =>
                  setMinCount(type, value === '' ? '' : Number(value))
                }
              />
            )}
          </FormGroup>
        )
      })}
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
