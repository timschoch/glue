import { useCallback, useMemo } from 'react'
import type { MouseEvent } from 'react'

import type { Part, PartSummary } from '../db/parts.ts'
import { Record } from '../design-system/record.tsx'
import { toRecordPart, toRecordSummaries } from './part-views.ts'
import { changePin } from './project-search.ts'
import { useProjectLinks } from './use-project-links.ts'

// One record in the main window. `parts` are the Parts of the Project: a
// record id in the text opens its record.
export function RecordScreen({
  part,
  parts,
}: {
  part: Part
  parts: ReadonlyArray<PartSummary>
}) {
  const { search, recordHref, open, changeSearch } = useProjectLinks()
  const bodyParts = useMemo(
    () => toRecordSummaries(parts, recordHref),
    [parts, recordHref],
  )
  const record = useMemo(
    () => toRecordPart(part, recordHref),
    [part, recordHref],
  )
  const handleOpen = useCallback(
    (recordId: string, event: MouseEvent<HTMLAnchorElement>) => {
      const opened = bodyParts.find(({ id }) => id === recordId)
      if (opened) open(opened.href, event)
    },
    [bodyParts, open],
  )

  return (
    <Record
      part={record}
      bodyParts={bodyParts}
      pinned={search.pins?.includes(part.id) ?? false}
      onPinChange={(pinned) => changeSearch(changePin(search, part.id, pinned))}
      onOpen={handleOpen}
    />
  )
}
