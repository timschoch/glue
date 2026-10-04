import type { MouseEvent } from 'react'

import { Card } from './card.tsx'
import type { PartType, Trust, WorkState } from './card.tsx'
import styles from './part-list.module.scss'

// What the card of a Part in the list shows.
export type PartListPart = {
  // The record id, for example D12.
  id: string
  type: PartType
  title: string
  trust: Trust
  workState: WorkState
  // The name of the home Concept.
  concept: string
  href: string
}

export type PartListProps = {
  title: string
  parts: ReadonlyArray<PartListPart>
  onOpen?: (part: PartListPart, event: MouseEvent<HTMLAnchorElement>) => void
}

// Parts of mixed types from the whole Project in the main window: the title
// and one card per Part, with its Work state and its home Concept. Each card
// opens its record.
export function PartList({ title, parts, onOpen }: PartListProps) {
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
