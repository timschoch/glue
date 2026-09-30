import {
  Button,
  Checkbox,
  NativeSelect,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'

import { findProblem } from '../../authentication/credentials.ts'
import type { Problems } from '../../authentication/credentials.ts'
import type { Failure } from '../../authentication/session.ts'
import type { Concept, Decision } from '../../db/concept.ts'
import { validateProposal } from '../../db/decision-proposal.ts'
import type {
  DecisionProposal,
  ProposalField,
} from '../../db/decision-proposal.ts'
import { RecordTitle } from '../records/record-link.tsx'
import classes from './decision-form.module.css'

function readTexts(form: HTMLFormElement, name: string): string[] {
  return new FormData(form)
    .getAll(name)
    .filter((value) => typeof value === 'string')
}

// The form for a new Decision. With `superseded` it starts from that
// Decision, and the new Decision replaces it.
export function DecisionForm({
  concept,
  owner,
  evidence,
  superseded,
  submit,
}: {
  concept: Concept
  owner: string
  evidence?: string
  superseded?: Decision
  submit: (proposal: DecisionProposal) => Promise<Failure | undefined>
}) {
  const [problems, setProblems] = useState<Partial<Problems<ProposalField>>>({})
  const [failure, setFailure] = useState<string>()
  const [pending, setPending] = useState(false)
  const evidenceProblem = useId()

  const sources = [...concept.insights, ...concept.facts]
  const picked = superseded
    ? superseded.evidence.map(({ id }) => id)
    : evidence
      ? [evidence]
      : []
  const missing =
    concept.goals.length === 0
      ? 'A Decision serves a Goal. This Concept has no Goal yet.'
      : sources.length === 0
        ? 'A Decision links to its evidence. This Concept has no Insight and no Fact yet.'
        : undefined

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const proposal = {
      title: readTexts(form, 'title').join(),
      goal: readTexts(form, 'goal').join(),
      evidence: readTexts(form, 'evidence'),
      body: readTexts(form, 'body').join(),
      owner: readTexts(form, 'owner').join(),
      supersedes: superseded?.id,
    }

    const found = validateProposal(proposal)
    setProblems(found)
    setFailure(undefined)
    const first = findProblem(found)
    if (first) {
      form.querySelector<HTMLElement>(`[name="${first[0]}"]`)?.focus()
      return
    }

    setPending(true)
    try {
      const failed = await submit(proposal)
      if (failed) setFailure(failed.message)
    } catch {
      setFailure(
        'The Decision is not saved. Check your connection, then try again.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={classes.page}>
      <Title order={1} className={classes.title}>
        {superseded ? (
          <>
            Supersede <RecordTitle record={superseded} />
          </>
        ) : (
          'Propose a Decision'
        )}
      </Title>
      {missing ? (
        <>
          <p className={classes.note}>{missing}</p>
          <Link from="/$product" to="/$product" params={true}>
            Go to the Concept
          </Link>
        </>
      ) : (
        <form onSubmit={handleSubmit} noValidate className={classes.form}>
          {superseded && (
            <p className={classes.note}>
              The new Decision is accepted when you save it. {superseded.id}{' '}
              becomes superseded.
            </p>
          )}
          <div role="alert" className={classes.failure}>
            {failure}
          </div>
          <TextInput
            name="title"
            label="Title"
            size="md"
            defaultValue={superseded?.title}
            error={problems.title}
          />
          <NativeSelect
            name="goal"
            label="Goal"
            size="md"
            defaultValue={superseded?.goal.id ?? ''}
            error={problems.goal}
          >
            <option value="">Pick a Goal</option>
            {concept.goals.map(({ id, title }) => (
              <option key={id} value={id}>
                {id} {title}
              </option>
            ))}
          </NativeSelect>
          <fieldset
            className={classes.evidence}
            aria-describedby={problems.evidence ? evidenceProblem : undefined}
          >
            <legend className={classes.legend}>Evidence</legend>
            <ul className={classes.sources}>
              {sources.map((source) => (
                <li key={source.id}>
                  <Checkbox
                    name="evidence"
                    value={source.id}
                    label={<RecordTitle record={source} />}
                    defaultChecked={picked.includes(source.id)}
                    classNames={{ label: classes.source }}
                  />
                </li>
              ))}
            </ul>
            {problems.evidence && (
              <p id={evidenceProblem} className={classes.problem}>
                {problems.evidence}
              </p>
            )}
          </fieldset>
          <Textarea
            name="body"
            label="Reason"
            description="Why this Decision, and what it rules out. Markdown works."
            size="md"
            rows={6}
            classNames={{ input: classes.reason }}
            defaultValue={superseded?.body}
          />
          <TextInput
            name="owner"
            label="Owner"
            size="md"
            autoComplete="name"
            defaultValue={owner}
            error={problems.owner}
          />
          <div className={classes.end}>
            <Button type="submit" size="md" disabled={pending}>
              {pending
                ? 'Saving the Decision'
                : superseded
                  ? `Supersede ${superseded.id}`
                  : 'Propose the Decision'}
            </Button>
            {superseded ? (
              <Link
                from="/$product"
                to="/$product/concept/$recordId"
                params={(current) => ({ ...current, recordId: superseded.id })}
                className={classes.cancel}
              >
                Cancel
              </Link>
            ) : (
              <Link
                from="/$product"
                to="/$product"
                params={true}
                className={classes.cancel}
              >
                Cancel
              </Link>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
