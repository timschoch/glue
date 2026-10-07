import { Add, ArrowDown, ArrowUp, Subtract } from '@carbon/icons-react'
import {
  Button,
  FormGroup,
  IconButton,
  Select,
  SelectItem,
  TextInput,
} from '@carbon/react'
import type { ReactNode } from 'react'

import styles from './part-form.module.scss'
import type { PartFormPart } from './part-search.tsx'

// One step of a Flow in the form. `entity` is the record id of the Entity
// that the step works on.
export type StepValue = { text: string; entity: string | null }

// One field of an Entity in the form.
export type FieldValue = { name: string; meaning: string }

type RowsProps<TRow> = {
  id: string
  label: string
  rows: ReadonlyArray<TRow>
  invalidText?: string
  onChange: (rows: ReadonlyArray<TRow>) => void
}

// The rows of one list field, and the button that adds a row at its end.
function Rows({
  label,
  addLabel,
  invalidText,
  onAdd,
  children,
}: {
  label: string
  addLabel: string
  invalidText?: string
  onAdd: () => void
  children: ReactNode
}) {
  return (
    <FormGroup
      legendText={label}
      invalid={invalidText !== undefined}
      message={invalidText !== undefined}
      messageText={invalidText}
      className={styles.rows}
    >
      {children}
      <Button kind="tertiary" size="sm" renderIcon={Add} onClick={onAdd}>
        {addLabel}
      </Button>
    </FormGroup>
  )
}

const replaceRow = <TRow,>(
  rows: ReadonlyArray<TRow>,
  index: number,
  changed: Partial<TRow>,
) => rows.map((row, at) => (at === index ? { ...row, ...changed } : row))

const removeRow = <TRow,>(rows: ReadonlyArray<TRow>, index: number) =>
  rows.filter((_, at) => at !== index)

// The rows with the one of `index` at the place of `to`, and that one here.
function swapRows<TRow>(rows: ReadonlyArray<TRow>, index: number, to: number) {
  const swapped = [...rows]
  swapped[index] = rows[to]
  swapped[to] = rows[index]
  return swapped
}

// The steps of a Flow, in their order: each a text and the Entity that it
// works on, with the controls that move it and remove it.
export function StepRows({
  id,
  label,
  rows,
  entities,
  invalidText,
  onChange,
}: RowsProps<StepValue> & {
  // The Entities of the Project that a step can name.
  entities: ReadonlyArray<PartFormPart>
}) {
  return (
    <Rows
      label={label}
      addLabel="Add step"
      invalidText={invalidText}
      onAdd={() => onChange([...rows, { text: '', entity: null }])}
    >
      {rows.length > 0 && (
        <ol className={styles.rowList}>
          {rows.map(({ text, entity }, index) => {
            const place = index + 1
            return (
              // The rows have no id of their own: the place is the key.
              <li key={place} className={styles.row}>
                <TextInput
                  id={`${id}-${place}-text`}
                  labelText={`Step ${place}`}
                  value={text}
                  className={styles.rowText}
                  onChange={({ target }) =>
                    onChange(replaceRow(rows, index, { text: target.value }))
                  }
                />
                <Select
                  id={`${id}-${place}-entity`}
                  labelText={`Entity of step ${place}`}
                  value={entity ?? ''}
                  className={styles.rowChoice}
                  onChange={({ target }) =>
                    onChange(
                      replaceRow(rows, index, { entity: target.value || null }),
                    )
                  }
                >
                  <SelectItem value="" text="" />
                  {entities.map((part) => (
                    <SelectItem
                      key={part.id}
                      value={part.id}
                      text={`${part.id} ${part.title}`}
                    />
                  ))}
                </Select>
                <div className={styles.rowControls}>
                  <IconButton
                    kind="ghost"
                    size="md"
                    label={`Move step ${place} up`}
                    disabled={index === 0}
                    onClick={() => onChange(swapRows(rows, index, index - 1))}
                  >
                    <ArrowUp />
                  </IconButton>
                  <IconButton
                    kind="ghost"
                    size="md"
                    label={`Move step ${place} down`}
                    disabled={index === rows.length - 1}
                    onClick={() => onChange(swapRows(rows, index, index + 1))}
                  >
                    <ArrowDown />
                  </IconButton>
                  <IconButton
                    kind="ghost"
                    size="md"
                    align="bottom-end"
                    label={`Remove step ${place}`}
                    onClick={() => onChange(removeRow(rows, index))}
                  >
                    <Subtract />
                  </IconButton>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Rows>
  )
}

// The fields of an Entity: each a name and its meaning, with the control
// that removes it.
export function FieldRows({
  id,
  label,
  rows,
  invalidText,
  onChange,
}: RowsProps<FieldValue>) {
  return (
    <Rows
      label={label}
      addLabel="Add field"
      invalidText={invalidText}
      onAdd={() => onChange([...rows, { name: '', meaning: '' }])}
    >
      {rows.length > 0 && (
        <ul className={styles.rowList}>
          {rows.map(({ name, meaning }, index) => {
            const place = index + 1
            return (
              // The rows have no id of their own: the place is the key.
              <li key={place} className={styles.row}>
                <TextInput
                  id={`${id}-${place}-name`}
                  labelText={`Field ${place}`}
                  value={name}
                  className={styles.rowChoice}
                  onChange={({ target }) =>
                    onChange(replaceRow(rows, index, { name: target.value }))
                  }
                />
                <TextInput
                  id={`${id}-${place}-meaning`}
                  labelText={`Meaning of field ${place}`}
                  value={meaning}
                  className={styles.rowText}
                  onChange={({ target }) =>
                    onChange(replaceRow(rows, index, { meaning: target.value }))
                  }
                />
                <div className={styles.rowControls}>
                  <IconButton
                    kind="ghost"
                    size="md"
                    align="bottom-end"
                    label={`Remove field ${place}`}
                    onClick={() => onChange(removeRow(rows, index))}
                  >
                    <Subtract />
                  </IconButton>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Rows>
  )
}
