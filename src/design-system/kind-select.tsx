import { useId } from 'react'

import { AddDropdown } from './add-dropdown.tsx'

export type KindOption = { slug: string; name: string }

// The field that picks the Kind of a Concept: one of the Kinds of the
// Project, or none. Its last item adds a Kind.
export function KindSelect({
  kinds,
  value,
  size,
  failure,
  onChange,
  onAdd,
}: {
  kinds: ReadonlyArray<KindOption>
  // The slug of the Kind.
  value: string | null
  size?: 'sm' | 'md'
  // Why the last pick was not saved.
  failure?: string
  onChange: (kind: string | null) => void
  onAdd?: () => void
}) {
  const id = useId()

  return (
    <AddDropdown
      id={id}
      label="Kind"
      options={[
        { value: '', name: 'None' },
        ...kinds.map(({ slug, name }) => ({ value: slug, name })),
      ]}
      value={value ?? ''}
      thing="Kind"
      size={size}
      failure={failure}
      onChange={(kind) => onChange(kind || null)}
      onAdd={onAdd}
    />
  )
}
