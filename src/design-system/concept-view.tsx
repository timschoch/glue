import { Add, Link } from '@carbon/icons-react'
import { Button, ClickableTile } from '@carbon/react'
import type { MouseEvent, SyntheticEvent } from 'react'

import { Card } from './card.tsx'
import type { PartType, Trust } from './card.tsx'
import styles from './concept-view.module.scss'

// The Part types in the order of the loop, each with its word for one Part
// and for many.
const partTypes = [
  { type: 'insight', one: 'Insight', many: 'Insights' },
  { type: 'goal', one: 'Goal', many: 'Goals' },
  { type: 'decision', one: 'Decision', many: 'Decisions' },
  { type: 'entity', one: 'Entity', many: 'Entities' },
  { type: 'flow', one: 'Flow', many: 'Flows' },
  { type: 'guardrail', one: 'Guardrail', many: 'Guardrails' },
  { type: 'metric', one: 'Metric', many: 'Metrics' },
] as const satisfies ReadonlyArray<{
  type: PartType
  one: string
  many: string
}>

const kinds = { brief: 'Brief' } as const

// The read model shapes of a Concept, with the Trust of each Part.
export type ConceptViewPart = {
  // The record id, for example D12.
  id: string
  type: PartType
  title: string
  status: string | null
  // The slug of the home Concept.
  concept: string
  trust: Trust
}

export type ConceptViewNode = {
  slug: string
  title: string
  kind: keyof typeof kinds | null
  partCount: number
  concepts: ReadonlyArray<ConceptViewNode>
}

export type ConceptViewProps = {
  concept: {
    slug: string
    title: string
    kind: keyof typeof kinds | null
    concepts: ReadonlyArray<ConceptViewNode>
    // The Parts that have their home here.
    parts: ReadonlyArray<ConceptViewPart>
    // The Parts with a home elsewhere that a link glues to a Part of this
    // Concept.
    linkedParts: ReadonlyArray<ConceptViewPart>
    // One slot per Part type of the Kind.
    slots: ReadonlyArray<{ type: PartType; filled: boolean }>
  }
  // The lens: the Part types to show. Without it the view shows all types.
  types?: ReadonlyArray<PartType>
  partHref: (part: ConceptViewPart) => string
  conceptHref: (concept: ConceptViewNode) => string
  onOpenPart?: (
    part: ConceptViewPart,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void
  // A tile opens with a click or with a key.
  onOpenConcept?: (concept: ConceptViewNode, event: SyntheticEvent) => void
  // Without a type: the first Part of a Concept that has none.
  onAddPart: (type?: PartType) => void
}

// One Concept in the main window: its head, the Concepts inside it, and its
// Parts in one group per Part type. A slot of the Kind with no Part shows as
// an empty slot at the place of its type.
export function ConceptView({
  concept,
  types,
  partHref,
  conceptHref,
  onOpenPart,
  onOpenConcept,
  onAddPart,
}: ConceptViewProps) {
  const groups = partTypes
    .filter(({ type }) => types === undefined || types.includes(type))
    .map((words) => ({
      ...words,
      parts: concept.parts.filter(({ type }) => type === words.type),
      linkedParts: concept.linkedParts.filter(
        ({ type }) => type === words.type,
      ),
      empty: concept.slots.some(
        (slot) => slot.type === words.type && !slot.filled,
      ),
    }))
    .filter(
      ({ parts, linkedParts, empty }) =>
        parts.length > 0 || linkedParts.length > 0 || empty,
    )

  function card(part: ConceptViewPart) {
    return (
      <Card
        type={part.type}
        recordId={part.id}
        title={part.title}
        trust={part.trust}
        href={partHref(part)}
        onOpen={onOpenPart && ((event) => onOpenPart(part, event))}
      />
    )
  }

  return (
    <div className={styles.view}>
      <header className={styles.group}>
        {concept.kind && (
          <span className={styles.label}>{kinds[concept.kind]}</span>
        )}
        <h1 className={styles.title}>{concept.title}</h1>
      </header>
      {concept.concepts.length > 0 && (
        <nav aria-label="Concepts">
          <ul className={styles.items}>
            {concept.concepts.map((child) => (
              <li key={child.slug}>
                <ClickableTile
                  href={conceptHref(child)}
                  onClick={
                    onOpenConcept && ((event) => onOpenConcept(child, event))
                  }
                  className={styles.group}
                >
                  <span className={styles.conceptTitle}>{child.title}</span>
                  <span className={styles.label}>
                    {child.partCount} {child.partCount === 1 ? 'Part' : 'Parts'}
                  </span>
                </ClickableTile>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {groups.length === 0 && (
        <div className={styles.group}>
          <h2 className={styles.groupTitle}>No Parts</h2>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Add}
            className={styles.add}
            onClick={() => onAddPart()}
          >
            Add Part
          </Button>
        </div>
      )}
      {groups.map(({ type, one, many, parts, linkedParts, empty }) => (
        <section key={type} aria-labelledby={type} className={styles.group}>
          <h2 id={type} className={styles.groupTitle}>
            {many}
          </h2>
          <ul className={styles.items}>
            {parts.map((part) => (
              <li key={part.id}>{card(part)}</li>
            ))}
            {linkedParts.map((part) => (
              <li key={part.id} className={styles.group}>
                {card(part)}
                <span className={styles.home}>
                  <Link aria-label="Link" className={styles.glyph} />
                  {part.concept}
                </span>
              </li>
            ))}
            {empty && (
              <li className={styles.emptySlot}>
                <span className={styles.slotType}>{one}</span>
                <Button
                  kind="ghost"
                  size="sm"
                  renderIcon={Add}
                  className={styles.add}
                  onClick={() => onAddPart(type)}
                >
                  Add {one}
                </Button>
              </li>
            )}
          </ul>
        </section>
      ))}
    </div>
  )
}
