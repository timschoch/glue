import type { MouseEvent } from 'react'

import { Card } from './card.tsx'
import type { PartType, Reading, Trust, WorkState } from './card.tsx'
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
  href: string
}

export type PartCardsProps = {
  title: string
  parts: ReadonlyArray<PartCardsPart>
  onOpen?: (part: PartCardsPart, event: MouseEvent<HTMLAnchorElement>) => void
}

// Parts of mixed types from the whole Project in the main window: the title
// and one card per Part, with its Work state and its home Concept. Each card
// opens its record.
export function PartCards({ title, parts, onOpen }: PartCardsProps) {
  return (
    <div className={styles.list}>
      <h1 className={styles.title}>{title}</h1>
      {parts.length > 0 && (
        <ul className={styles.items}>
          {parts.map((part) => (
            <li key={part.id}>
              <Card
                type={part.type}
                recordId={part.id}
                title={part.title}
                trust={part.trust}
                reading={part.reading}
                workState={part.workState}
                concept={part.concept}
                href={part.href}
                onOpen={onOpen && ((event) => onOpen(part, event))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
