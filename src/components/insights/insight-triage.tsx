import { Button, VisuallyHidden } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import type { RecordReference } from '../../db/concept.ts'
import classes from '../records/record-actions.module.css'
import { useRecordAction } from '../records/use-record-action.ts'
import type { RecordAction } from '../records/use-record-action.ts'

// The id of the Keep button of a draft. The page moves the focus to it
// after the triage of the draft before it.
export function keepButtonId(insightId: string) {
  return `keep-${insightId}`
}

// What a person does with a draft Insight: keep it, discard it, or propose
// a Decision from it. The id is in the name of each control, so a screen
// reader tells the rows of a list apart.
// A draft that a Decision cites stays: `citedBy` has the ids of those
// Decisions, and the draft has no Discard.
export function InsightTriage({
  insight,
  citedBy,
  onKeep,
  onDiscard,
}: {
  insight: RecordReference
  citedBy: ReadonlyArray<string>
  onKeep: RecordAction
  onDiscard: RecordAction
}) {
  const { pending, failure, run } = useRecordAction()
  const [confirming, setConfirming] = useState(false)
  // After the question, the focus goes back to the button that asked it.
  const returning = useRef(false)
  const id = <VisuallyHidden>{insight.id}</VisuallyHidden>

  function closeQuestion() {
    returning.current = true
    setConfirming(false)
  }

  // After a discard that worked, the draft is gone and the page moves the
  // focus. The question closes only when the draft is still there.
  async function handleDiscard() {
    if (!(await run('discard', onDiscard))) closeQuestion()
  }

  return (
    <div className={classes.actions}>
      {confirming ? (
        <>
          <p className={classes.question}>
            You cannot get a discarded Insight back.
          </p>
          <Button
            variant="default"
            size="xs"
            autoFocus
            disabled={pending !== undefined}
            onClick={closeQuestion}
          >
            Do not discard {id}
          </Button>
          <Button
            variant="default"
            size="xs"
            disabled={pending !== undefined}
            onClick={handleDiscard}
          >
            {/* One element: the button label is a flex box and drops the
                space between its parts. */}
            <span>
              {pending === 'discard' ? 'Discarding' : 'Discard'} {id} for good
            </span>
          </Button>
        </>
      ) : (
        <>
          <Button
            id={keepButtonId(insight.id)}
            variant="default"
            size="xs"
            disabled={pending !== undefined}
            onClick={() => run('keep', onKeep)}
          >
            {pending === 'keep' ? 'Keeping' : 'Keep'} {id}
          </Button>
          {citedBy.length === 0 && (
            <Button
              ref={(button) => {
                if (button && returning.current) button.focus()
                returning.current = false
              }}
              variant="default"
              size="xs"
              disabled={pending !== undefined}
              onClick={() => setConfirming(true)}
            >
              Discard {id}
            </Button>
          )}
          <Link
            from="/$product"
            to="/$product/decisions/new"
            params={true}
            search={{ evidence: insight.id }}
            className={classes.link}
          >
            Propose a Decision{' '}
            <VisuallyHidden>from {insight.id}</VisuallyHidden>
          </Link>
          {citedBy.length > 0 && (
            <p className={classes.note}>
              {insight.id} is evidence of {citedBy.join(', ')}, so you cannot
              discard it.
            </p>
          )}
        </>
      )}
      <div role="alert" className={classes.failure}>
        {failure}
      </div>
    </div>
  )
}
