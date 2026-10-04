import { ComboBox } from '@carbon/react'

import type { PartType, Trust } from './card.tsx'

// A Part that a search offers, with what its minimal card shows.
export type PartFormPart = {
  // The record id, for example G2.
  id: string
  type: PartType
  title: string
  trust: Trust
  href: string
}

// The field holds the search only. The caller shows the picks.
const searchText = () => ''

function PartOption({ id, title }: PartFormPart) {
  return `${id} ${title}`
}

function matchesSearch({ id, title }: PartFormPart, search: string) {
  const words = search.trim().toLowerCase()
  return id.toLowerCase().includes(words) || title.toLowerCase().includes(words)
}

// A search over the given Parts, by record id or by title. A pick goes to
// the caller and does not stay in the field.
export function PartSearch({
  id,
  label,
  parts,
  invalidText,
  onPick,
}: {
  id: string
  label: string
  parts: ReadonlyArray<PartFormPart>
  invalidText?: string
  onPick: (recordId: string) => void
}) {
  return (
    <ComboBox
      id={id}
      titleText={label}
      items={[...parts]}
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
  )
}
