import { getRouteApi, useRouter } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import type { MouseEvent } from 'react'

import type { Part, PartSummary } from '../db/parts.ts'
import { partTypes } from '../design-system/card.tsx'
import { Record } from '../design-system/record.tsx'
import type { RecordAction } from '../design-system/record.tsx'
import { PartFormScreen } from './part-form-screen.tsx'
import { toRecordPart, toRecordSummaries } from './part-views.ts'
import { changePin } from './project-search.ts'
import { useProjectLinks } from './use-project-links.ts'
import { useWrite } from './use-write.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// One record in the main window. `parts` are the Parts of the Project: a
// record id in the text opens its record, and a Joint goes to one of them.
// The form that the address names takes the place of the record.
export function RecordScreen({
  part,
  parts,
}: {
  part: Part
  parts: ReadonlyArray<PartSummary>
}) {
  const router = useRouter()
  const { updatePart, removePart, addJoint, removeJoint } =
    projectRoute.useRouteContext()
  const { project, search, conceptHref, recordHref, open, changeSearch } =
    useProjectLinks()
  const { pending, failure, write } = useWrite()
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

  const supersedes =
    part.type === 'decision' &&
    (part.status === 'proposed' || part.status === 'accepted')
  if (search.edit) {
    return <PartFormScreen type={part.type} edited={part} parts={parts} />
  }
  if (search.add === 'decision' && supersedes) {
    return <PartFormScreen type="decision" superseded={part} parts={parts} />
  }

  // Each write names the status that the person sees. When a second person
  // changed it, the write does not happen.
  const seen = { project, recordId: part.id, expected: { status: part.status } }
  const name = `${partTypes[part.type]} ${part.id}`
  // A removed Part has no record: its home Concept opens.
  const leave = () =>
    router.navigate({ href: conceptHref(part.concept) }).then(() => {})
  const change = (status: 'accepted' | null) => () =>
    updatePart({ ...seen, change: { status } })
  const remove = () => removePart(seen)

  const supersede: RecordAction = {
    label: 'Supersede',
    onClick: () => void changeSearch({ ...search, add: 'decision' }),
  }
  // A Decision has no status for a rejected one, so Reject removes it.
  const actions: ReadonlyArray<RecordAction> =
    part.type === 'decision' && part.status === 'proposed'
      ? [
          {
            label: 'Accept',
            onClick: () => void write('Accepting', change('accepted')),
          },
          {
            label: 'Reject',
            confirm: { title: `Reject ${name}`, label: 'Reject it' },
            onClick: () => void write('Rejecting', remove, leave),
          },
          supersede,
        ]
      : supersedes
        ? [supersede]
        : part.type === 'insight' && part.status === 'draft'
          ? [
              {
                label: 'Keep',
                onClick: () => void write('Keeping', change(null)),
              },
              {
                label: 'Discard',
                confirm: { title: `Discard ${name}`, label: 'Discard it' },
                onClick: () => void write('Discarding', remove, leave),
              },
            ]
          : []

  return (
    <Record
      part={record}
      bodyParts={bodyParts}
      actions={actions}
      pending={pending}
      error={failure}
      onEdit={() => void changeSearch({ ...search, edit: true })}
      jointParts={bodyParts}
      onAddJoint={(needed) =>
        void write('Saving', () =>
          addJoint({ project, joint: { part: part.id, needs: needed } }),
        )
      }
      onRemoveJoint={(jointId) =>
        void write('Saving', () => removeJoint({ project, jointId }))
      }
      pinned={search.pins?.includes(part.id) ?? false}
      onPinChange={(pinned) =>
        void changeSearch(changePin(search, part.id, pinned))
      }
      onOpen={handleOpen}
    />
  )
}
