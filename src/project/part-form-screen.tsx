import { getRouteApi, useRouter } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import type { Part, PartSummary, PartType } from '../db/parts.ts'
import { PartForm } from '../design-system/part-form.tsx'
import type { PartFormValues } from '../design-system/part-form.tsx'
import { isEvidence } from '../part-fields.ts'
import { todayUtc } from '../today-utc.ts'
import {
  findEmptyStep,
  findProblems,
  toExpectedPart,
  toFormValues,
  toNewPart,
  toPartChange,
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
  needed?: Pick<PartSummary, 'id' | 'type'>
  // The Parts of the Project: the pickers search them.
  parts: ReadonlyArray<PartSummary>
}) {
  const router = useRouter()
  const { addPart, updatePart } = projectRoute.useRouteContext()
  const { people } = projectRoute.useLoaderData()
  const { project, concept, search, recordHref, open, changeSearch } =
    useProjectLinks()
  const { pending, failure, failurePlace, write } = useWrite()
  const [errors, setErrors] = useState<ReturnType<typeof findProblems>>({})
  const [emptyStep, setEmptyStep] = useState(-1)
  // The server names the step that it refused: the reason shows there.
  const refusedStep =
    failurePlace?.field === 'steps' ? failurePlace.row : undefined
  const formParts = useMemo(
    () => toRecordSummaries(parts, recordHref),
    [parts, recordHref],
  )
  // A Decision needs a Goal and its evidence through the form. Each other
  // needed Part is a Joint of the new Part.
  const picked =
    type !== 'decision' || !needed
      ? undefined
      : needed.type === 'goal'
        ? { goal: needed.id }
        : isEvidence(needed.type)
          ? { evidence: [needed.id] }
          : undefined
  // The form starts with the Responsible of the Part. A new Part starts
  // with the person who adds it.
  const startMember = edited
    ? people.assignments.find(
        ({ part, role }) => part === edited.id && role === 'responsible',
      )?.memberId
    : people.me
  const responsible =
    people.members.find(({ id }) => id === startMember)?.email ?? ''
  const [startValues] = useState<Partial<PartFormValues>>(() => {
    if (edited) return toFormValues(edited, responsible)
    const added = { responsible, date: todayUtc(), ...picked }
    if (!superseded) return added
    const { goal, evidence } = toFormValues(superseded)
    return { ...added, goal, evidence }
  })
  const closed = { ...search, add: undefined, edit: undefined }

  function handleSave(values: PartFormValues) {
    const problems = findProblems(type, values)
    setErrors(problems)
    setEmptyStep(findEmptyStep(values.steps))
    if (Object.keys(problems).length > 0) return

    if (edited) {
      void write(
        'Saving',
        () =>
          updatePart({
            project,
            recordId: edited.id,
            change: toPartChange(
              type,
              values,
              toFormValues(edited, responsible),
            ),
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
            needs: needed && !picked ? [needed.id] : undefined,
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
      members={people.members}
      errors={refusedStep === undefined ? errors : { steps: failure }}
      invalidStep={refusedStep ?? emptyStep}
      serverError={refusedStep === undefined ? failure : undefined}
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
