import { Button, VisuallyHidden } from '@mantine/core'

import type { Goal } from '../../db/concept.ts'
import classes from '../records/record-actions.module.css'
import { useRecordAction } from '../records/use-record-action.ts'
import type { RecordAction } from '../records/use-record-action.ts'

// What a person does with a Goal: close it as achieved, or open it again.
// Glue never closes a Goal itself.
export function GoalActions({
  goal,
  onClose,
  onReopen,
}: {
  goal: Pick<Goal, 'id' | 'status'>
  onClose: RecordAction
  onReopen: RecordAction
}) {
  const { pending, failure, run } = useRecordAction()
  const id = <VisuallyHidden>{goal.id}</VisuallyHidden>
  const running = pending !== undefined

  return (
    <div className={classes.actions}>
      {goal.status === 'open' ? (
        <Button
          variant="default"
          size="xs"
          disabled={running}
          onClick={() => run('close', onClose)}
        >
          {/* One element: the button label is a flex box and drops the
              space between its parts. */}
          <span>
            {running ? 'Closing' : 'Close'} {id} as achieved
          </span>
        </Button>
      ) : (
        <Button
          variant="default"
          size="xs"
          disabled={running}
          onClick={() => run('reopen', onReopen)}
        >
          <span>
            {running ? 'Opening' : 'Open'} {id} again
          </span>
        </Button>
      )}
      <div role="alert" className={classes.failure}>
        {failure}
      </div>
    </div>
  )
}
