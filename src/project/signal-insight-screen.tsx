import { getRouteApi, useRouter } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import type { PartSummary } from '../db/parts.ts'
import type { Signal } from '../db/signals.ts'
import { PartForm } from '../design-system/part-form.tsx'
import type { PartFormValues } from '../design-system/part-form.tsx'
import { findProblems, todayUtc } from './part-form-values.ts'
import { toRecordSummaries } from './part-views.ts'
import { useProjectLinks } from './use-project-links.ts'
import { useWrite } from './use-write.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// The Part form in the main window, for the Insight that grows from the
// picked Signals. Its home is the open Concept.
export function SignalInsightScreen({
  signals,
  parts,
  onClose,
}: {
  signals: ReadonlyArray<Signal>
  // The Parts of the Project: the pickers search them.
  parts: ReadonlyArray<PartSummary>
  onClose: () => void
}) {
  const router = useRouter()
  const { addSignalInsight } = projectRoute.useRouteContext()
  const { project, concept, search, recordHref, open } = useProjectLinks()
  const { pending, failure, write } = useWrite()
  const [errors, setErrors] = useState<ReturnType<typeof findProblems>>({})
  const formParts = useMemo(
    () => toRecordSummaries(parts, recordHref),
    [parts, recordHref],
  )
  const urls = signals.map(({ url }) => url)
  const [startValues] = useState<Partial<PartFormValues>>(() => ({
    title: signals.length === 1 ? signals[0].title : '',
    source: urls.join(' '),
    date: todayUtc(),
    evidenceLevel: 'hunch',
  }))

  function handleSave(values: PartFormValues) {
    const problems = findProblems('insight', values)
    setErrors(problems)
    if (Object.keys(problems).length > 0) return

    void write(
      'Saving',
      () =>
        addSignalInsight({
          project,
          insight: {
            signals: urls,
            title: values.title,
            body: values.body,
            source: values.source,
            date: values.date.trim(),
            evidenceLevel: values.evidenceLevel ?? undefined,
            concept,
          },
        }),
      ({ id }) =>
        router.navigate({
          to: '/$project/$concept/$recordId',
          params: { project, concept, recordId: id },
          search: { section: search.section, pins: search.pins },
        }),
    )
  }

  return (
    <PartForm
      type="insight"
      values={startValues}
      parts={formParts}
      errors={errors}
      serverError={failure}
      pending={pending !== undefined}
      onSave={handleSave}
      onCancel={onClose}
      onOpen={(recordId, event) => {
        const opened = formParts.find(({ id }) => id === recordId)
        if (opened) open(opened.href, event)
      }}
    />
  )
}
