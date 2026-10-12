import { Add } from '@carbon/icons-react'
import { Dropdown } from '@carbon/react'

import styles from './add-dropdown.module.scss'

export type DropdownOption = { value: string; name: string }

// The last item of the dropdown. It is no option: it adds a thing.
type AddItem = { name: string; add: true }

// A dropdown that picks one thing of a list, and can add one. The add
// action is its last item, after a divider (design-system/D15).
export function AddDropdown({
  id,
  label,
  hideLabel,
  options,
  value,
  thing,
  size,
  failure,
  onChange,
  onAdd,
}: {
  id: string
  label: string
  hideLabel?: boolean
  options: ReadonlyArray<DropdownOption>
  value: string
  // What the last item adds, for example Project.
  thing: string
  size?: 'sm' | 'md'
  // Why the last pick was not saved.
  failure?: string
  onChange: (value: string) => void
  // With the callback the dropdown ends with the item that adds a thing.
  onAdd?: () => void
}) {
  const items: Array<DropdownOption | AddItem> = [
    ...options,
    ...(onAdd ? [{ name: `Add ${thing}`, add: true } as const] : []),
  ]

  return (
    <Dropdown
      id={id}
      titleText={label}
      hideLabel={hideLabel}
      label={label}
      size={size}
      items={items}
      itemToString={(item) => item?.name ?? ''}
      itemToElement={(item) =>
        item && 'add' in item ? (
          <span className={styles.add}>
            {item.name}
            <Add />
          </span>
        ) : (
          (item?.name ?? '')
        )
      }
      selectedItem={options.find((option) => option.value === value) ?? null}
      invalid={failure !== undefined}
      invalidText={failure}
      onChange={({ selectedItem }) => {
        if (!selectedItem) return
        if ('add' in selectedItem) onAdd?.()
        else onChange(selectedItem.value)
      }}
      className={onAdd && styles.withAdd}
    />
  )
}
