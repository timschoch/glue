import { Button, VisuallyHidden } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import type { Decision } from '../../db/concept.ts'
import classes from '../records/record-actions.module.css'
import { useRecordAction } from '../records/use-record-action.ts'
import type { RecordAction } from '../records/use-record-action.ts'

// What a person does with a Decision that is not superseded: accept it when
// it is proposed, or write the Decision that supersedes it.
export function DecisionActions({
  decision,
  onAccept,
}: {
  decision: Pick<Decision, 'id' | 'status'>
  onAccept: RecordAction
}) {
  const { pending, failure, run } = useRecordAction()
  const id = <VisuallyHidden>{decision.id}</VisuallyHidden>

  return (
    <div className={classes.actions}>
      {decision.status === 'proposed' && (
        <Button
          size="xs"
          disabled={pending !== undefined}
          onClick={() => run('accept', onAccept)}
        >
          {pending === 'accept' ? 'Accepting' : 'Accept'} {id}
        </Button>
      )}
      <Link
        from="/$product"
        to="/$product/decisions/new"
        params={true}
        search={{ supersedes: decision.id }}
        className={classes.link}
      >
        Supersede {id}
      </Link>
      <div role="alert" className={classes.failure}>
        {failure}
      </div>
    </div>
  )
}
