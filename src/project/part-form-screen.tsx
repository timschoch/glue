import { getRouteApi, useRouter } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import type { Part, PartSummary, PartType } from '../db/parts.ts'
import { PartForm } from '../design-system/part-form.tsx'
import type { PartFormValues } from '../design-system/part-form.tsx'
import {
  findProblems,
  toExpectedPart,
  toFormValues,
  toNewPart,
  toPartChange,
  todayUtc,
} from './part-form-values.ts'
import { toRecordSummaries } from './part-views.ts'
import { useProjectLinks } from './use-project-links.ts'
import { useWrite } from './use-write.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// The Part form in the main window. With `edited` it changes that Part.
// Without it, it adds a Part of the type to the open Concept. With
// `superseded`, the new Decision supersedes that Decision. With `needed`,
// the new Part needs that Part.
export function PartFormScreen({
  type,
  edited,
  superseded,
  needed,
  parts,
}: {
  type: PartType
  edited?: Part
  superseded?: Part
  needed?: Part
  // The Parts of the Project: the pickers search them.
  parts: ReadonlyArray<PartSummary>
}) {
  const router = useRouter()
  const { session, addPart, updatePart } = projectRoute.useRouteContext()
  const { project, concept, search, recordHref, open, changeSearch } =
    useProjectLinks()
  const { pending, failure, write } = useWrite()
  const [errors, setErrors] = useState<ReturnType<typeof findProblems>>({})
  const formParts = useMemo(
    () => toRecordSummaries(parts, recordHref),
    [parts, recordHref],
  )
  const [startValues] = useState<Partial<PartFormValues>>(() => {
    if (edited) return toFormValues(edited)
    const added = { owner: session.user.name, date: todayUtc() }
    // A Decision needs its Goal and its evidence through the form.
    if (needed?.type === 'goal') return { ...added, goal: needed.id }
    if (needed?.type === 'insight' || needed?.type === 'guardrail') {
      return { ...added, evidence: [needed.id] }
    }
    if (!superseded) return added
    const { goal, evidence } = toFormValues(superseded)
    return { ...added, goal, evidence }
  })
  const closed = { ...search, add: undefined, edit: undefined }

  function handleSave(values: PartFormValues) {
    const problems = findProblems(type, values)
    setErrors(problems)
    if (Object.keys(problems).length > 0) return

    if (edited) {
      void write(
        'Saving',
        () =>
          updatePart({
            project,
            recordId: edited.id,
            change: toPartChange(type, values),
            expected: toExpectedPart(edited),
          }),
        () => changeSearch(closed),
      )
      return
    }
    void write(
      'Saving',
      () =>
        addPart({
          project,
          part: toNewPart(type, values, {
            concept: superseded?.concept ?? concept,
            supersedes: superseded?.id,
            needs: needed && type !== 'decision' ? [needed.id] : undefined,
          }),
        }),
      ({ id }) =>
        router.navigate({
          to: '/$project/$concept/$recordId',
          params: {
            project,
            concept: superseded?.concept ?? concept,
            recordId: id,
          },
          search: { section: search.section, pins: search.pins },
        }),
    )
  }

  return (
    <PartForm
      type={type}
      recordId={edited?.id}
      values={startValues}
      parts={formParts}
      errors={errors}
      serverError={failure}
      pending={pending !== undefined}
      onSave={handleSave}
      onCancel={() => void changeSearch(closed)}
      onOpen={(recordId, event) => {
        const opened = formParts.find(({ id }) => id === recordId)
        if (opened) open(opened.href, event)
      }}
    />
  )
}
