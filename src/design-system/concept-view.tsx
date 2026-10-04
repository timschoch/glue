import { Add } from '@carbon/icons-react'
import { Button, ClickableTile, ContentSwitcher, Switch } from '@carbon/react'
import { useState } from 'react'
import type { MouseEvent, ReactElement, ReactNode, SyntheticEvent } from 'react'

import { Card, partTypes } from './card.tsx'
import type { PartType, Trust } from './card.tsx'
import type { MapJoint } from './concept-map-layout.ts'
import { ConceptMap } from './concept-map.tsx'
import styles from './concept-view.module.scss'

// The Part types in the order of the loop, each with its word for many Parts.
const typeGroups = [
  { type: 'insight', many: 'Insights' },
  { type: 'goal', many: 'Goals' },
  { type: 'decision', many: 'Decisions' },
  { type: 'guardrail', many: 'Guardrails' },
  { type: 'entity', many: 'Entities' },
  { type: 'flow', many: 'Flows' },
  { type: 'metric', many: 'Metrics' },
] as const satisfies ReadonlyArray<{ type: PartType; many: string }>

const kinds = { brief: 'Brief' } as const

// The count of cards that a folded type group shows.
const FOLDED_COUNT = 6

// The ghost button that adds a thing, named with the thing.
function AddButton({ thing, onClick }: { thing: string; onClick: () => void }) {
  return (
    <Button
      kind="ghost"
      size="sm"
      renderIcon={Add}
      className={styles.add}
      onClick={onClick}
    >
      Add {thing}
    </Button>
  )
}

// The group of one Part type: its title, its cards, and its one add control.
// A group with more cards than the folded count shows the first ones until
// its button unfolds it. An empty slot of the Kind is the add control of its
// group. Every other group has the control after its list.
function TypeGroup({
  type,
  many,
  cards,
  empty,
  onAdd,
}: {
  type: PartType
  many: string
  // Each card has the record id of its Part as its key.
  cards: ReadonlyArray<ReactElement>
  empty: boolean
  onAdd?: () => void
}) {
  const [unfolded, setUnfolded] = useState(false)
  const folds = cards.length > FOLDED_COUNT
  const shownCards = folds && !unfolded ? cards.slice(0, FOLDED_COUNT) : cards
  const add = onAdd && <AddButton thing={partTypes[type]} onClick={onAdd} />

  return (
    <section aria-labelledby={type} className={styles.group}>
      <h2 id={type} className={styles.groupTitle}>
        {many}
      </h2>
      {(shownCards.length > 0 || empty) && (
        <ul className={styles.items}>
          {shownCards.map((card) => (
            <li key={card.key}>{card}</li>
          ))}
          {empty && (
            <li className={styles.emptySlot}>
              {add ?? (
                <span className={`${styles.label} ${styles.slotType}`}>
                  {partTypes[type]}
                </span>
              )}
            </li>
          )}
        </ul>
      )}
      {(folds || (add && !empty)) && (
        <div className={styles.buttons}>
          {folds && (
            <Button
              kind="ghost"
              size="sm"
              aria-expanded={unfolded}
              onClick={() => setUnfolded((current) => !current)}
            >
              {unfolded ? `Show ${FOLDED_COUNT}` : `Show all ${cards.length}`}
            </Button>
          )}
          {!empty && add}
        </div>
      )}
    </section>
  )
}

// The read model shapes of a Concept, with the Trust of each Part.
export type ConceptViewPart = {
  // The record id, for example D12.
  id: string
  type: PartType
  title: string
  status: string | null
  // The slug of the home Concept.
  concept: string
  // The title of the home Concept. The read model does not have it yet.
  conceptTitle: string
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
    // The lines of the map. `part` needs `needs`: two record ids.
    joints?: ReadonlyArray<MapJoint>
  }
  // The list of the Parts in their type groups, or the map of the Parts.
  view?: 'list' | 'map'
  // With the callback the head holds the switch between the list and the map.
  onViewChange?: (view: 'list' | 'map') => void
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
  // With the callback each Part type of the lens shows its group, with one
  // control that adds a Part of the type. Without it the view has no such
  // control: an empty slot shows its type alone.
  onAddPart?: (type: PartType) => void
  // With the callback the row of Concepts holds one button that adds a
  // Concept inside this one.
  onAddConcept?: () => void
  // One more group, after the Parts.
  children?: ReactNode
  // The Contract of the Concept, below the head.
  contract?: ReactNode
  // The Responsible and the Co-Authors of the Concept.
  assignees?: ReactNode
}

// One Concept in the main window: its head, the Concepts inside it, and its
// Parts in one group per Part type. A linked Part names its home Concept on
// its card. A slot of the Kind with no Part shows as an empty slot at the
// place of its type. A type with no Part and no slot shows only while a Part
// can be added. A lens with no Part type, such as People, shows no Parts and
// no words about them. The map view shows the Concepts inside, the Parts and
// the empty slots as the nodes of the map.
export function ConceptView({
  concept,
  view = 'list',
  onViewChange,
  types,
  partHref,
  conceptHref,
  onOpenPart,
  onOpenConcept,
  onAddPart,
  onAddConcept,
  children,
  contract,
  assignees,
}: ConceptViewProps) {
  const groups = typeGroups
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
        onAddPart || parts.length > 0 || linkedParts.length > 0 || empty,
    )

  function card(part: ConceptViewPart, linked = false) {
    return (
      <Card
        key={part.id}
        type={part.type}
        recordId={part.id}
        title={part.title}
        trust={part.trust}
        concept={linked ? part.conceptTitle : undefined}
        href={partHref(part)}
        onOpen={onOpenPart && ((event) => onOpenPart(part, event))}
      />
    )
  }

  return (
    <div className={styles.view}>
      <header className={styles.head}>
        <div className={styles.group}>
          {concept.kind && (
            <span className={styles.label}>{kinds[concept.kind]}</span>
          )}
          <h1 className={styles.title}>{concept.title}</h1>
        </div>
        {onViewChange && (
          <ContentSwitcher
            size="sm"
            selectedIndex={view === 'map' ? 1 : 0}
            onChange={({ name }) =>
              onViewChange(name === 'map' ? 'map' : 'list')
            }
            className={styles.switch}
          >
            <Switch name="list" text="List" />
            <Switch name="map" text="Map" />
          </ContentSwitcher>
        )}
      </header>
      {assignees}
      {contract}
      {view === 'map' && (
        <ConceptMap
          concept={{ ...concept, joints: concept.joints ?? [] }}
          types={types}
          partHref={partHref}
          conceptHref={conceptHref}
          onOpenPart={onOpenPart}
          onOpenConcept={onOpenConcept}
          onAddPart={onAddPart}
        />
      )}
      {view === 'list' && (concept.concepts.length > 0 || onAddConcept) && (
        <nav aria-label="Concepts" className={styles.group}>
          {concept.concepts.length > 0 && (
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
                      {child.partCount}{' '}
                      {child.partCount === 1 ? 'Part' : 'Parts'}
                    </span>
                  </ClickableTile>
                </li>
              ))}
            </ul>
          )}
          {onAddConcept && <AddButton thing="Concept" onClick={onAddConcept} />}
        </nav>
      )}
      {view === 'list' && groups.length === 0 && types?.length !== 0 && (
        <p className={styles.label}>No Parts</p>
      )}
      {view === 'list' &&
        groups.map(({ type, many, parts, linkedParts, empty }) => (
          <TypeGroup
            key={type}
            type={type}
            many={many}
            cards={[
              ...parts.map((part) => card(part)),
              ...linkedParts.map((part) => card(part, true)),
            ]}
            empty={empty}
            onAdd={onAddPart && (() => onAddPart(type))}
          />
        ))}
      {children}
    </div>
  )
}
