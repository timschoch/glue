import {
  Button,
  Checkbox,
  CheckboxGroup,
  ClickableTile,
  Form,
  InlineLoading,
  InlineNotification,
  TextInput,
} from '@carbon/react'
import { useId, useState } from 'react'
import type { FormEvent, MouseEvent, SyntheticEvent } from 'react'

import { Card } from './card.tsx'
import type { PartType, Trust } from './card.tsx'
import viewStyles from './concept-view.module.scss'
import styles from './people.module.scss'

// The steps of the loop, in the order of the loop.
const loopSteps = {
  understand: 'Understand',
  decide: 'Decide',
  design: 'Design',
  build: 'Build',
  use: 'Use',
} as const

export type LoopStep = keyof typeof loopSteps

const steps = Object.keys(loopSteps) as LoopStep[]

// The Concepts and the Parts that a member holds in one role.
export type PeopleHeld = {
  concepts: ReadonlyArray<{ slug: string; title: string; href: string }>
  parts: ReadonlyArray<{
    // The record id, for example D12.
    id: string
    type: PartType
    title: string
    trust: Trust
    href: string
  }>
}

export type PeopleMember = {
  id: number
  name: string
  email: string
  loopSteps: ReadonlyArray<LoopStep>
  responsible: PeopleHeld
  coAuthor: PeopleHeld
  // A member watches Parts only.
  watches: PeopleHeld
}

export type PeopleProps = {
  members: ReadonlyArray<PeopleMember>
  // The member id of the person who reads, or null for a person who is no
  // member.
  me: number | null
  // Sets the loop steps of the person who reads.
  onLoopStepsChange?: (loopSteps: LoopStep[]) => void
  // Adds the account of the e-mail address as a member.
  onAddMember?: (email: string) => void
  // Opens the Concept or the record of the address.
  onOpen?: (href: string, event: SyntheticEvent) => void
  // The words of the write that runs.
  pending?: string
  // Why the last write failed.
  error?: string
}

// The Concepts and the Parts of one role of a member.
function Held({
  title,
  held,
  onOpen,
}: {
  title: string
  held: PeopleHeld
  onOpen: PeopleProps['onOpen']
}) {
  const titleId = useId()
  if (held.concepts.length === 0 && held.parts.length === 0) return null

  return (
    <div className={viewStyles.group}>
      <h3 id={titleId} className={viewStyles.label}>
        {title}
      </h3>
      <ul aria-labelledby={titleId} className={viewStyles.items}>
        {held.concepts.map((concept) => (
          <li key={concept.slug}>
            <ClickableTile
              href={concept.href}
              onClick={onOpen && ((event) => onOpen(concept.href, event))}
            >
              <span className={viewStyles.conceptTitle}>{concept.title}</span>
            </ClickableTile>
          </li>
        ))}
        {held.parts.map((part) => (
          <li key={part.id}>
            <Card
              type={part.type}
              recordId={part.id}
              title={part.title}
              trust={part.trust}
              href={part.href}
              onOpen={
                onOpen &&
                ((event: MouseEvent<HTMLAnchorElement>) =>
                  onOpen(part.href, event))
              }
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Member({
  member,
  onLoopStepsChange,
  onOpen,
}: {
  member: PeopleMember
  onLoopStepsChange: PeopleProps['onLoopStepsChange']
  onOpen: PeopleProps['onOpen']
}) {
  const id = useId()

  return (
    <section aria-labelledby={id} className={viewStyles.group}>
      <h2 id={id} className={viewStyles.groupTitle}>
        {member.name}
      </h2>
      <span className={viewStyles.label}>{member.email}</span>
      {onLoopStepsChange ? (
        <CheckboxGroup legendText="Loop steps" orientation="horizontal">
          {steps.map((step) => (
            <Checkbox
              key={step}
              id={`${id}-${step}`}
              labelText={loopSteps[step]}
              checked={member.loopSteps.includes(step)}
              onChange={(_event, { checked }) =>
                onLoopStepsChange(
                  steps.filter((other) =>
                    other === step ? checked : member.loopSteps.includes(other),
                  ),
                )
              }
            />
          ))}
        </CheckboxGroup>
      ) : (
        member.loopSteps.length > 0 && (
          <span className={viewStyles.label}>
            {steps
              .filter((step) => member.loopSteps.includes(step))
              .map((step) => loopSteps[step])
              .join(', ')}
          </span>
        )
      )}
      <Held title="Responsible" held={member.responsible} onOpen={onOpen} />
      <Held title="Co-Author" held={member.coAuthor} onOpen={onOpen} />
      <Held title="Watches" held={member.watches} onOpen={onOpen} />
    </section>
  )
}

// The section People in the main window: each member of the Project with the
// usual loop steps and with the Concepts and Parts that the member holds. A
// member sets the own loop steps and adds other members.
export function People({
  members,
  me,
  onLoopStepsChange,
  onAddMember,
  onOpen,
  pending,
  error,
}: PeopleProps) {
  const fieldId = useId()
  const [email, setEmail] = useState('')
  const address = email.trim()

  const add = (event: FormEvent) => {
    event.preventDefault()
    if (address === '' || pending !== undefined) return
    onAddMember?.(address)
    setEmail('')
  }

  return (
    <div className={viewStyles.view}>
      <header className={viewStyles.group}>
        <h1 className={viewStyles.title}>People</h1>
      </header>
      {members.map((member) => (
        <Member
          key={member.id}
          member={member}
          onLoopStepsChange={member.id === me ? onLoopStepsChange : undefined}
          onOpen={onOpen}
        />
      ))}
      {onAddMember && (
        <Form className={styles.form} onSubmit={add}>
          <TextInput
            id={fieldId}
            className={styles.field}
            type="email"
            labelText="E-mail"
            value={email}
            onChange={({ target }) => setEmail(target.value)}
          />
          {pending !== undefined ? (
            <InlineLoading description={pending} />
          ) : (
            <Button type="submit" size="sm" disabled={address === ''}>
              Add member
            </Button>
          )}
        </Form>
      )}
      {error !== undefined && (
        <InlineNotification
          kind="error"
          role="alert"
          lowContrast
          hideCloseButton
          title={error}
        />
      )}
    </div>
  )
}
