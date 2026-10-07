import { InlineLoading, InlineNotification } from '@carbon/react'
import { useId, useState } from 'react'
import type { MouseEvent } from 'react'

import { Card } from './card.tsx'
import type {
  PartType,
  Reading,
  ReviewNote,
  Slot,
  Trust,
  WorkState,
} from './card.tsx'
import { PartSearch } from './part-search.tsx'
import type { PartFormPart } from './part-search.tsx'
import styles from './part-cards.module.scss'

// What the card of a Part in the list shows.
export type PartCardsPart = {
  // The record id, for example D12.
  id: string
  type: PartType
  title: string
  trust: Trust
  // The Part of an Ask shows none.
  workState?: WorkState
  // Only a Goal or a Metric has one.
  reading?: Reading
  // The name of the home Concept.
  concept: string
  // What happened to a watched Part: its open flags.
  note?: string
  // The Parts under review that the Part needs.
  reviewNotes?: ReadonlyArray<ReviewNote>
  // What the Part needs and does not have.
  emptySlots?: ReadonlyArray<Slot>
  href: string
}

// An open Ask: the card of its Part with the one step that it waits for. A
// step with a pick asks for one of its Parts first.
export type PartCardsAsk = {
  id: number
  part: PartCardsPart
  action:
    | { label: string; onClick: () => void }
    | {
        label: string
        pick: {
          label: string
          parts: ReadonlyArray<PartFormPart>
          onPick: (recordId: string) => void
        }
      }
}

export type PartCardsProps = {
  title: string
  parts: ReadonlyArray<PartCardsPart>
  // The Asks that need the person, in a group of their own.
  asks?: ReadonlyArray<PartCardsAsk>
  // The words of the step that runs.
  pending?: string
  // Why the last step failed.
  error?: string
  // The Parts that the person watches, in a group of their own.
  watched?: ReadonlyArray<PartCardsPart>
  onOpen?: (part: PartCardsPart, event: MouseEvent<HTMLAnchorElement>) => void
}

function Cards({
  parts,
  onOpen,
  labelledBy,
}: Pick<PartCardsProps, 'parts' | 'onOpen'> & { labelledBy?: string }) {
  return (
    <ul aria-labelledby={labelledBy} className={styles.items}>
      {parts.map((part) => (
        <li key={part.id}>
          <Card
            type={part.type}
            recordId={part.id}
            title={part.title}
            trust={part.trust}
            summary={part.note}
            reviewNotes={part.reviewNotes}
            reading={part.reading}
            emptySlots={part.emptySlots}
            workState={part.workState}
            concept={part.concept}
            href={part.href}
            onOpen={onOpen && ((event) => onOpen(part, event))}
          />
        </li>
      ))}
    </ul>
  )
}

// The open Asks, below their own title. The button on each card is its step.
function Asks({
  asks,
  pending,
  error,
  onOpen,
}: Pick<PartCardsProps, 'pending' | 'error' | 'onOpen'> & {
  asks: ReadonlyArray<PartCardsAsk>
}) {
  const titleId = useId()
  const pickId = useId()
  // The Ask whose step waits for its Part.
  const [picking, setPicking] = useState<number>()

  return (
    <section className={styles.group}>
      <h2 id={titleId} className={styles.groupTitle}>
        Asks
      </h2>
      <ul aria-labelledby={titleId} className={styles.items}>
        {asks.map(({ id, part, action }) => (
          <li key={id} className={styles.ask}>
            <Card
              type={part.type}
              recordId={part.id}
              title={part.title}
              trust={part.trust}
              summary={part.note}
              concept={part.concept}
              href={part.href}
              onOpen={onOpen && ((event) => onOpen(part, event))}
              action={{
                label: action.label,
                // One step runs at a time.
                disabled: pending !== undefined,
                onClick: () =>
                  'pick' in action ? setPicking(id) : action.onClick(),
              }}
            />
            {picking === id && 'pick' in action && pending === undefined && (
              <PartSearch
                id={pickId}
                label={action.pick.label}
                parts={action.pick.parts}
                onPick={(recordId) => {
                  setPicking(undefined)
                  action.pick.onPick(recordId)
                }}
              />
            )}
          </li>
        ))}
      </ul>
      {pending !== undefined && <InlineLoading description={pending} />}
      {error !== undefined && (
        <InlineNotification
          kind="error"
          role="alert"
          lowContrast
          hideCloseButton
          title={error}
        />
      )}
    </section>
  )
}

// Parts of mixed types from the whole Project in the main window: the title
// and one card per Part, with its Work state and its home Concept. Each card
// opens its record. The Asks come first, the watched Parts last, each group
// below its own title.
export function PartCards({
  title,
  parts,
  asks = [],
  pending,
  error,
  watched = [],
  onOpen,
}: PartCardsProps) {
  const watchedId = useId()
  const empty = asks.length + parts.length + watched.length === 0

  return (
    <div className={styles.list}>
      <h1 className={styles.title}>{title}</h1>
      {empty && <p className={styles.label}>No Parts</p>}
      {asks.length > 0 && (
        <Asks asks={asks} pending={pending} error={error} onOpen={onOpen} />
      )}
      {parts.length > 0 && <Cards parts={parts} onOpen={onOpen} />}
      {watched.length > 0 && (
        <section className={styles.group}>
          <h2 id={watchedId} className={styles.groupTitle}>
            Watched
          </h2>
          <Cards parts={watched} onOpen={onOpen} labelledBy={watchedId} />
        </section>
      )}
    </div>
  )
}
