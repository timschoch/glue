import { getRouteApi, useRouter } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'

import type { Build } from '../db/builds.ts'
import type { Answer, Part, PartSummary } from '../db/parts.ts'
import { partTypes } from '../design-system/card.tsx'
import { Record } from '../design-system/record.tsx'
import type { RecordAction } from '../design-system/record.tsx'
import { AssigneesControl } from './assignees-control.tsx'
import { findCommonFlow } from './common-flow.ts'
import { LinkedBuilds } from './linked-builds.tsx'
import { PartFormScreen } from './part-form-screen.tsx'
import { toRecordPart, toRecordSummaries } from './part-views.ts'
import { changePin, isPartType } from './project-search.ts'
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
  builds = [],
}: {
  part: Part
  parts: ReadonlyArray<PartSummary>
  // The builds of the Project: the record shows the ones that name it.
  builds?: ReadonlyArray<Build>
}) {
  const router = useRouter()
  const { answerPart, answerQuestion, addJoint, removeJoint } =
    projectRoute.useRouteContext()
  const { project, search, conceptHref, recordHref, open, changeSearch } =
    useProjectLinks()
  const { pending, failure, write } = useWrite()
  // The answer in words to a Decision in review.
  const [words, setWords] = useState('')
  // The option of the question that the answer takes: the pick of the author
  // until the person picks.
  const [option, setOption] = useState(part.question?.pick ?? null)
  const bodyParts = useMemo(
    () => toRecordSummaries(parts, recordHref),
    [parts, recordHref],
  )
  const record = useMemo(
    () => toRecordPart(part, recordHref, parts),
    [part, recordHref, parts],
  )
  const flow = useMemo(() => findCommonFlow(part), [part])
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
  // The next step of a flow adds a Part that needs this one.
  if (isPartType(search.add)) {
    return <PartFormScreen type={search.add} needed={part} parts={parts} />
  }

  const named = builds.filter(({ decisions }) =>
    decisions.some(({ id }) => id === part.id),
  )
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

  // A proposed Decision with options asks a question. Its answer is an
  // option, or the words of the person in place of one. It signs the
  // Decision off.
  const asks =
    part.status === 'proposed' &&
    part.question !== null &&
    part.question.answer === null &&
    part.question.options.length > 0
  const text = words.trim()
  const chosen = text !== '' ? { text } : option !== null && { option }
  const answerQuestionAction: RecordAction = {
    label: 'Answer',
    onClick: () => {
      if (!chosen) return
      void write(
        'Saving',
        () => answerQuestion({ project, recordId: part.id, answer: chosen }),
        () => Promise.resolve(setWords('')),
      )
    },
  }

  // The answers that the Work state takes, the usual one first. A sunk Part
  // keeps its record, but no answer brings it back: the person confirms.
  const answers = part.answers.map((given): RecordAction =>
    asks && given === 'supersede'
      ? answerQuestionAction
      : given === 'wait'
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
  // A published Decision has no usual answer: the Decision that supersedes
  // it comes before the answers.
  const answerActions = !supersedes
    ? answers
    : part.workState === 'published'
      ? [supersede, ...answers]
      : [...answers, supersede]
  // The next step of the flow is the button. A next step that is an answer
  // is the usual answer, which comes first already. Each other next step
  // opens a form or the home Concept.
  const next = flow?.next
  const actions =
    next === undefined || next.kind === 'answer'
      ? answerActions
      : [
          {
            label: next.label,
            onClick: () =>
              void (next.kind === 'concept'
                ? router.navigate({ href: conceptHref(part.concept) })
                : changeSearch(
                    next.kind === 'edit'
                      ? { ...search, edit: true }
                      : { ...search, add: next.type },
                  )),
          },
          ...answerActions,
        ]

  return (
    <Record
      part={record}
      flow={
        flow && { name: flow.name, steps: flow.steps, current: flow.current }
      }
      bodyParts={bodyParts}
      actions={actions}
      pending={pending}
      error={failure}
      words={takesWords ? { value: words, onChange: setWords } : undefined}
      choice={asks ? { value: option, onChange: setOption } : undefined}
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
      assignees={<AssigneesControl target={{ part: part.id }} />}
    >
      {named.length > 0 && <LinkedBuilds builds={named} />}
    </Record>
  )
}
