import { getRouteApi } from '@tanstack/react-router'
import { useState } from 'react'

import { findSignalFilterProblems } from '../db/signal-filter-rule.ts'
import type { SignalFilter } from '../db/signal-filters.ts'
import {
  SignalFilterForm,
  signalFilterFormFields,
} from '../design-system/signal-filter-form.tsx'
import type { SignalFilterFormProps } from '../design-system/signal-filter-form.tsx'
import { useProjectLinks } from './use-project-links.ts'
import { useWrite } from './use-write.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// The form in the main window that saves a filter of the Signals of the
// Project, or changes or deletes the saved filter. After the write the
// screen shows the Signals again.
export function SignalFilterFormScreen({
  filter,
  filters,
  onClose,
}: {
  // The saved filter that the form changes. None: the form adds a filter.
  filter?: SignalFilter
  // The saved filters of the Project: a name is free or taken.
  filters: ReadonlyArray<SignalFilter>
  // Gets the id of the filter that the form saved.
  onClose: (saved?: number) => void
}) {
  const { addSignalFilter, updateSignalFilter, removeSignalFilter } =
    projectRoute.useRouteContext()
  const { project } = useProjectLinks()
  const { pending, failure, failurePlace, write } = useWrite()
  const [errors, setErrors] = useState<SignalFilterFormProps['errors']>({})
  // The server names the field that it refused: the reason shows there.
  const failedField = signalFilterFormFields.find(
    (field) => field === failurePlace?.field,
  )
  const close = (saved?: { id: number }) => Promise.resolve(onClose(saved?.id))

  return (
    <SignalFilterForm
      filter={filter}
      errors={failedField ? { [failedField]: failure } : errors}
      serverError={failedField ? undefined : failure}
      pending={
        pending === undefined
          ? undefined
          : pending === 'Deleting'
            ? 'Deleting'
            : 'Saving'
      }
      onCancel={() => onClose()}
      onSave={(values) => {
        const isTaken = filters.some(
          ({ id, name }) => id !== filter?.id && name === values.name,
        )
        const problems = {
          ...findSignalFilterProblems(values),
          ...(isTaken && { name: 'A filter has this name already.' }),
        }
        setErrors(problems)
        if (Object.keys(problems).length > 0) return
        void write(
          'Saving',
          () =>
            filter
              ? updateSignalFilter({
                  project,
                  filterId: filter.id,
                  filter: values,
                })
              : addSignalFilter({ project, filter: values }),
          close,
        )
      }}
      onDelete={
        filter &&
        (() =>
          void write(
            'Deleting',
            () => removeSignalFilter({ project, filterId: filter.id }),
            () => close(),
          ))
      }
    />
  )
}
