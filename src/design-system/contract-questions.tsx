import { Button, InlineLoading, Link, TextArea } from '@carbon/react'
import { useId, useState } from 'react'
import type { MouseEvent } from 'react'

import styles from './contract-questions.module.scss'

// The length of the day in an ISO time: 2026-10-02.
const DAY_LENGTH = 10

// A question about a Contract Version, and its answer.
export type ContractQuestionRow = {
  id: number
  // The Concept of the question, in a list of more than one Concept.
  concept?: { title: string; href: string }
  // The Contract Version that the builder asked about.
  version: number
  // The Concept has a newer Version.
  stale: boolean
  text: string
  askedBy: string
  // An ISO time.
  askedAt: string
  // null: the question is open.
  answer: { text: string; by: string; at: string } | null
}

// The write of a field: the words while it runs, or why it failed.
export type ContractQuestionWrite = {
  // The field of the new question, or the id of the question that gets its
  // answer.
  at: 'ask' | number
  pending?: string
  failure?: string
}

export type ContractQuestionsProps = {
  // The newest question first.
  questions: ReadonlyArray<ContractQuestionRow>
  write?: ContractQuestionWrite
  // With it the list has the field of a new question.
  onAsk?: (text: string) => void
  // With it each open question has the field of its answer.
  onAnswer?: (id: number, text: string) => void
  onOpenConcept?: (
    question: ContractQuestionRow,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void
}

function By({ name, at }: { name: string; at: string }) {
  return (
    <span>
      {name} <time dateTime={at}>{at.slice(0, DAY_LENGTH)}</time>
    </span>
  )
}

// A button that opens its field. The field keeps its words when the write
// fails, and shows the failure. While the write runs, the words of the write
// take the place of the button Send.
function WordsField({
  label,
  missing,
  pending,
  failure,
  onSend,
}: {
  label: { button: string; field: string }
  // The reason that the field shows while it is empty.
  missing: string
  pending?: string
  failure?: string
  onSend: (words: string) => void
}) {
  const fieldId = useId()
  const [words, setWords] = useState<string>()
  const [isMissing, setIsMissing] = useState(false)

  if (words === undefined) {
    return (
      <Button kind="tertiary" size="sm" onClick={() => setWords('')}>
        {label.button}
      </Button>
    )
  }

  return (
    <div className={styles.field}>
      <TextArea
        id={fieldId}
        labelText={label.field}
        rows={2}
        value={words}
        invalid={isMissing || failure !== undefined}
        invalidText={isMissing ? missing : failure}
        onChange={({ target }) => {
          setWords(target.value)
          setIsMissing(false)
        }}
      />
      {pending !== undefined ? (
        <InlineLoading description={pending} />
      ) : (
        <Button
          kind="tertiary"
          size="sm"
          onClick={() => {
            const said = words.trim()
            if (said === '') setIsMissing(true)
            else onSend(said)
          }}
        >
          Send
        </Button>
      )}
    </div>
  )
}

// The questions about the Contract Versions of a Concept: each one with its
// Version, the stale mark of an old Version, who asked and when, and the
// answer. An open question has the field of its answer. A list with no
// question and no field is left out.
export function ContractQuestions({
  questions,
  write,
  onAsk,
  onAnswer,
  onOpenConcept,
}: ContractQuestionsProps) {
  const titleId = useId()
  if (questions.length === 0 && !onAsk) return null

  return (
    <section aria-labelledby={titleId} className={styles.group}>
      <h2 id={titleId} className={styles.title}>
        Questions
      </h2>
      {onAsk && (
        // A new question in the list means that the write worked: the field
        // closes.
        <WordsField
          key={questions.length}
          label={{ button: 'Ask', field: 'Question' }}
          missing="Enter a question."
          pending={write?.at === 'ask' ? write.pending : undefined}
          failure={write?.at === 'ask' ? write.failure : undefined}
          onSend={onAsk}
        />
      )}
      {questions.length > 0 && (
        <ul className={styles.list}>
          {questions.map((question) => (
            <li key={question.id} className={styles.question}>
              <span className={styles.signs}>
                {question.concept && (
                  <Link
                    href={question.concept.href}
                    onClick={
                      onOpenConcept &&
                      ((event) => onOpenConcept(question, event))
                    }
                  >
                    {question.concept.title}
                  </Link>
                )}
                <span>Version {question.version}</span>
                {question.stale && <span className={styles.stale}>Stale</span>}
                <By name={question.askedBy} at={question.askedAt} />
              </span>
              <p className={styles.text}>{question.text}</p>
              {question.answer ? (
                <div className={styles.answer}>
                  <p className={styles.text}>{question.answer.text}</p>
                  <span className={styles.signs}>
                    <By name={question.answer.by} at={question.answer.at} />
                  </span>
                </div>
              ) : (
                onAnswer && (
                  <WordsField
                    label={{ button: 'Answer', field: 'Answer' }}
                    missing="Enter an answer."
                    pending={
                      write?.at === question.id ? write.pending : undefined
                    }
                    failure={
                      write?.at === question.id ? write.failure : undefined
                    }
                    onSend={(text) => onAnswer(question.id, text)}
                  />
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
