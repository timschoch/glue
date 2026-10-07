import { getRouteApi } from '@tanstack/react-router'
import { useState } from 'react'

import type { ContractQuestion } from '../db/contract-questions.ts'
import { ContractQuestions } from '../design-system/contract-questions.tsx'
import type { ContractQuestionWrite } from '../design-system/contract-questions.tsx'
import { useProjectLinks } from './use-project-links.ts'
import { useWrite } from './use-write.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// The questions about the Contract Versions, with their writes. With
// `asked`, the slug of the open Concept, the person asks about its newest
// Version. Without it the list is of the whole Project, so each question
// names its Concept.
export function ContractQuestionsSection({
  questions,
  asked,
}: {
  questions: ReadonlyArray<ContractQuestion>
  asked?: string
}) {
  const { askContractQuestion, answerContractQuestion } =
    projectRoute.useRouteContext()
  const { project, conceptHref, open } = useProjectLinks()
  const { pending, failure, write } = useWrite()
  // The field of the write that runs, or that failed.
  const [at, setAt] = useState<ContractQuestionWrite['at']>()

  return (
    <ContractQuestions
      questions={questions.map((question) => ({
        ...question,
        concept:
          asked === undefined
            ? {
                title: question.conceptTitle,
                // The Concept opens with no lens: there it lists its questions.
                href: conceptHref(question.concept, {}),
              }
            : undefined,
      }))}
      write={at === undefined ? undefined : { at, pending, failure }}
      onAsk={
        asked === undefined
          ? undefined
          : (text) => {
              setAt('ask')
              void write('Saving', () =>
                askContractQuestion({ project, concept: asked, text }),
              )
            }
      }
      onAnswer={(questionId, text) => {
        setAt(questionId)
        void write('Saving', () =>
          answerContractQuestion({ project, questionId, text }),
        )
      }}
      onOpenConcept={({ concept }, event) =>
        concept && open(concept.href, event)
      }
    />
  )
}
