import { Select, SelectItem } from '@carbon/react'
import { useId } from 'react'

export type KindOption = { slug: string; name: string }

// The field that picks the Kind of a Concept: one of the Kinds of the
// Project, or none.
export function KindSelect({
  kinds,
  value,
  size,
  failure,
  onChange,
}: {
  kinds: ReadonlyArray<KindOption>
  // The slug of the Kind.
  value: string | null
  size?: 'sm' | 'md'
  // Why the last pick was not saved.
  failure?: string
  onChange: (kind: string | null) => void
}) {
  const id = useId()

  return (
    <Select
      id={id}
      labelText="Kind"
      size={size}
      value={value ?? ''}
      invalid={failure !== undefined}
      invalidText={failure}
      onChange={({ target }) => onChange(target.value || null)}
    >
      <SelectItem value="" text="None" />
      {kinds.map(({ slug, name }) => (
        <SelectItem key={slug} value={slug} text={name} />
      ))}
    </Select>
  )
}
