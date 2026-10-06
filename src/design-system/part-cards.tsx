import { useId } from 'react'
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
import styles from './part-cards.module.scss'

// What the card of a Part in the list shows.
export type PartCardsPart = {
  // The record id, for example D12.
  id: string
  type: PartType
  title: string
  trust: Trust
  workState: WorkState
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

export type PartCardsProps = {
  title: string
  parts: ReadonlyArray<PartCardsPart>
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

// Parts of mixed types from the whole Project in the main window: the title
// and one card per Part, with its Work state and its home Concept. Each card
// opens its record. The watched Parts come after, below their own title.
export function PartCards({
  title,
  parts,
  watched = [],
  onOpen,
}: PartCardsProps) {
  const watchedId = useId()

  return (
    <div className={styles.list}>
      <h1 className={styles.title}>{title}</h1>
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
