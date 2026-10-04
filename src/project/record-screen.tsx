import { getRouteApi } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'

import type { Answer, Part, PartSummary } from '../db/parts.ts'
import { partTypes } from '../design-system/card.tsx'
import { Record } from '../design-system/record.tsx'
import type { RecordAction } from '../design-system/record.tsx'
import { PartFormScreen } from './part-form-screen.tsx'
import { toRecordPart, toRecordSummaries } from './part-views.ts'
import { changePin } from './project-search.ts'
import { useProjectLinks } from './use-project-links.ts'
import { useWrite } from './use-write.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// The words of each answer on its button.
const answerLabels: { [answer in Answer]: string } = {
  fine: 'It is fine',
  supersede: 'Sign off',
  wait: 'Wait',
  'need-time': 'I need time',
  'not-ready': 'Not ready',
  sink: 'Sink it',
}

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
  const { answerPart, addJoint, removeJoint } = projectRoute.useRouteContext()
  const { project, search, recordHref, open, changeSearch } = useProjectLinks()
  const { pending, failure, write } = useWrite()
  // The answer in words to a Decision in review.
  const [words, setWords] = useState('')
  const bodyParts = useMemo(
    () => toRecordSummaries(parts, recordHref),
    [parts, recordHref],
  )
  const record = useMemo(
    () => toRecordPart(part, recordHref, parts),
    [part, recordHref, parts],
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

  const name = `${partTypes[part.type]} ${part.id}`
  // A Decision in review takes an answer in words. The server adds the name
  // of the person and the date.
  const takesWords = part.type === 'decision' && part.workState === 'review'
  const said = takesWords && words.trim() !== '' ? { words: words.trim() } : {}
  const answer = (given: Parameters<typeof answerPart>[0]['answer']) =>
    void write(
      'Saving',
      () => answerPart({ project, recordId: part.id, answer: given }),
      () => Promise.resolve(setWords('')),
    )

  // The answers that the Work state takes, the usual one first. A sunk Part
  // keeps its record, but no answer brings it back: the person confirms.
  const answers = part.answers.map((given): RecordAction =>
    given === 'wait'
      ? {
          label: answerLabels.wait,
          pick: {
            label: 'Wait for',
            onPick: (waitsOn) => answer({ answer: given, waitsOn }),
          },
        }
      : {
          label: answerLabels[given],
          confirm:
            given === 'sink'
              ? { title: `Sink ${name}`, label: 'Sink it' }
              : undefined,
          onClick: () => answer({ answer: given, ...said }),
        },
  )
  const supersede: RecordAction = {
    label: 'Supersede',
    onClick: () => void changeSearch({ ...search, add: 'decision' }),
  }
  // A published Decision has no usual answer: the next step is the Decision
  // that supersedes it.
  const actions = !supersedes
    ? answers
    : part.workState === 'published'
      ? [supersede, ...answers]
      : [...answers, supersede]

  return (
    <Record
      part={record}
      bodyParts={bodyParts}
      actions={actions}
      pending={pending}
      error={failure}
      words={takesWords ? { value: words, onChange: setWords } : undefined}
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
