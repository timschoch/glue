import { z } from 'zod'

import { createSessionGuard, toFailure } from './session-actions.ts'
import type { ActionRequest } from './session-actions.ts'
import { signalFilterSchema } from './signal-filter-rule.ts'
import {
  addSignalFilter,
  listSignalFilters,
  removeSignalFilter,
  updateSignalFilter,
} from './signal-filters.ts'

// The input of the server functions of the saved filters.
export const signalFiltersInputSchema = z.object({ project: z.string() })

export const signalFilterAddInputSchema = signalFiltersInputSchema.extend({
  filter: signalFilterSchema,
})

export const signalFilterRemoveInputSchema = signalFiltersInputSchema.extend({
  filterId: z.int().positive(),
})

export const signalFilterUpdateInputSchema =
  signalFilterRemoveInputSchema.extend({ filter: signalFilterSchema })

type SignalFiltersInput = z.infer<typeof signalFiltersInputSchema>
export type SignalFilterAddInput = z.input<typeof signalFilterAddInputSchema>
export type SignalFilterUpdateInput = z.input<
  typeof signalFilterUpdateInputSchema
>
export type SignalFilterRemoveInput = z.infer<
  typeof signalFilterRemoveInputSchema
>

// What the server functions of the saved filters do. Each action looks for
// the session first. A member of the Project saves, changes and deletes.
export function createSignalFilterActions(
  request: Pick<ActionRequest, 'findSession' | 'getDb'>,
) {
  const { withSession, withMember } = createSessionGuard(request)

  return {
    listSignalFilters: withSession((db, { project }: SignalFiltersInput) =>
      listSignalFilters(db, project),
    ),

    addSignalFilter: withMember(
      (db, { project, filter }: SignalFilterAddInput) =>
        addSignalFilter(db, project, filter).then(
          ({ id }) => ({ id }),
          toFailure,
        ),
    ),

    updateSignalFilter: withMember(
      (db, { project, filterId, filter }: SignalFilterUpdateInput) =>
        updateSignalFilter(db, project, filterId, filter).then(
          ({ id }) => ({ id }),
          toFailure,
        ),
    ),

    removeSignalFilter: withMember(
      (db, { project, filterId }: SignalFilterRemoveInput) =>
        removeSignalFilter(db, project, filterId).then(
          () => undefined,
          toFailure,
        ),
    ),
  }
}
