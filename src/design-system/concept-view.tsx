import { Add } from '@carbon/icons-react'
import {
  Button,
  ClickableTile,
  ContentSwitcher,
  InlineLoading,
  InlineNotification,
  Switch,
} from '@carbon/react'
import { useState } from 'react'
import type { MouseEvent, ReactElement, ReactNode, SyntheticEvent } from 'react'

import { Card, partTypes } from './card.tsx'
import type { PartType, ReviewNote, Slot, Trust } from './card.tsx'
import { NextBox } from './next-box.tsx'
import type { NextBoxProps } from './next-box.tsx'
import { StepBar } from './step-bar.tsx'
import type { StepBarProps } from './step-bar.tsx'
import styles from './concept-view.module.scss'
import { KindSelect } from './kind-select.tsx'
import type { KindOption } from './kind-select.tsx'

// The Part types in the order of the loop, each with its word for many Parts.
export const typeGroups = [
  { type: 'insight', many: 'Insights' },
  { type: 'goal', many: 'Goals' },
  { type: 'decision', many: 'Decisions' },
  { type: 'guardrail', many: 'Guardrails' },
  { type: 'entity', many: 'Entities' },
  { type: 'flow', many: 'Flows' },
  { type: 'metric', many: 'Metrics' },
] as const satisfies ReadonlyArray<{ type: PartType; many: string }>

// The count of cards that a folded type group shows.
const FOLDED_COUNT = 6

// The ghost button that adds a thing, named with the thing.
export function AddButton({
  thing,
  onClick,
}: {
  thing: string
  onClick: () => void
}) {
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
export function TypeGroup({
  type,
  many,
  cards,
  empty = false,
  onAdd,
}: {
  type: PartType
  many: string
  // Each card has the record id of its Part as its key.
  cards: ReadonlyArray<ReactElement>
  empty?: boolean
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
  // What the Part needs and does not have.
  emptySlots?: ReadonlyArray<Slot>
  // The Parts under review that the Part needs.
  reviewNotes?: ReadonlyArray<ReviewNote>
}

export type ConceptViewNode = {
  slug: string
  title: string
  // The slug of its Kind.
  kind: string | null
  partCount: number
  concepts: ReadonlyArray<ConceptViewNode>
}

// What a tile of a Concept says: its title and the count of its Parts.
export function ConceptSummary({
  concept,
}: {
  concept: Pick<ConceptViewNode, 'title' | 'partCount'>
}) {
  return (
    <>
      <span className={styles.conceptTitle}>{concept.title}</span>
      <span className={styles.label}>
        {concept.partCount} {concept.partCount === 1 ? 'Part' : 'Parts'}
      </span>
    </>
  )
}

export type ConceptViewProps = {
  concept: {
    slug: string
    title: string
    // The slug of its Kind.
    kind: string | null
    concepts: ReadonlyArray<ConceptViewNode>
    // The Parts that have their home here.
    parts: ReadonlyArray<ConceptViewPart>
    // The Parts with a home elsewhere that a link glues to a Part of this
    // Concept.
    linkedParts: ReadonlyArray<ConceptViewPart>
    // One slot per Part type of the Kind.
    slots: ReadonlyArray<{
      type: PartType
      required: boolean
      filled: boolean
    }>
  }
  // The Kinds of the Project.
  kinds?: ReadonlyArray<KindOption>
  // With the callback the head holds the field that picks the Kind of the
  // Concept, in place of the name of the Kind.
  onKindChange?: (kind: string | null) => void
  // The pick of a Kind that is not saved yet: it shows in place of the
  // field.
  kindPending?: string
  // Why the last pick of a Kind was not saved.
  kindFailure?: string
  // With the callbacks the head holds the button that opens the Kind of the
  // Concept, and the one that adds a Kind.
  onEditKind?: () => void
  onAddKind?: () => void
  // The list of the Parts in their type groups, or the Map.
  view?: 'list' | 'map'
  // The Map, and the panel beside it that shows what the Map opened.
  map?: ReactNode
  panel?: ReactNode
  // With the callback the head holds the switch between the list and the map.
  onViewChange?: (view: 'list' | 'map') => void
  partHref: (part: ConceptViewPart) => string
  conceptHref: (concept: ConceptViewNode) => string
  onOpenPart?: (
    part: ConceptViewPart,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void
  // A tile opens with a click or with a key.
  onOpenConcept?: (concept: ConceptViewNode, event: SyntheticEvent) => void
  // With the callback each Part type shows its group, with one
  // control that adds a Part of the type. Without it the view has no such
  // control: an empty slot shows its type alone.
  onAddPart?: (type: PartType) => void
  // With the callback the row of Concepts holds one button that adds a
  // Concept inside this one.
  onAddConcept?: () => void
  // With the callback the head holds the button that removes the Concept.
  onRemove?: () => void
  // Why the Concept was not removed.
  removeFailure?: string
  // One more group, after the Parts.
  children?: ReactNode
  // The Contract of the Concept, below the head.
  contract?: ReactNode
  // The Responsible and the Co-Authors of the Concept.
  assignees?: ReactNode
  // The common flow that the Concept is in, with its current step.
  flow?: StepBarProps
  // The box Next of the Concept, below the step bar.
  next?: NextBoxProps
}

// One Concept in the main window: its head, the step bar of its flow with
// the box Next, the Concepts inside it, and its
// Parts in one group per Part type. A linked Part names its home Concept on
// its card. A required slot of the Kind that is not filled shows as an
// empty slot at the place of its type. A type with no Part and no such slot
// shows only while a Part can be added. The map view shows the Map in place of the Concepts and the
// Parts, with its panel at the end of the row.
export function ConceptView({
  concept,
  kinds = [],
  onKindChange,
  kindPending,
  kindFailure,
  onEditKind,
  onAddKind,
  view = 'list',
  map,
  panel,
  onViewChange,
  partHref,
  conceptHref,
  onOpenPart,
  onOpenConcept,
  onAddPart,
  onAddConcept,
  onRemove,
  removeFailure,
  children,
  contract,
  assignees,
  flow,
  next,
}: ConceptViewProps) {
  const groups = typeGroups
    .map((words) => ({
      ...words,
      parts: concept.parts.filter(({ type }) => type === words.type),
      linkedParts: concept.linkedParts.filter(
        ({ type }) => type === words.type,
      ),
      empty: concept.slots.some(
        (slot) => slot.type === words.type && slot.required && !slot.filled,
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
        reviewNotes={part.reviewNotes}
        emptySlots={part.emptySlots}
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
          {concept.kind && !onKindChange && (
            <span className={styles.label}>
              {kinds.find(({ slug }) => slug === concept.kind)?.name ??
                concept.kind}
            </span>
          )}
          <h1 className={styles.title}>{concept.title}</h1>
          {onKindChange && (
            <div className={styles.kind}>
              {kindPending === undefined ? (
                <KindSelect
                  kinds={kinds}
                  value={concept.kind}
                  size="sm"
                  failure={kindFailure}
                  onChange={onKindChange}
                />
              ) : (
                <InlineLoading
                  description={kindPending}
                  className={styles.kindPending}
                />
              )}
              {concept.kind && onEditKind && (
                <Button kind="ghost" size="sm" onClick={onEditKind}>
                  Edit Kind
                </Button>
              )}
              {onAddKind && <AddButton thing="Kind" onClick={onAddKind} />}
            </div>
          )}
        </div>
        <div className={styles.buttons}>
          {onRemove && (
            <Button kind="danger" size="sm" onClick={onRemove}>
              Remove Concept
            </Button>
          )}
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
        </div>
      </header>
      {removeFailure && (
        <InlineNotification
          lowContrast
          hideCloseButton
          role="alert"
          kind="error"
          title={removeFailure}
        />
      )}
      {assignees}
      {flow && <StepBar {...flow} />}
      {next && <NextBox {...next} />}
      {contract}
      {view === 'map' && (
        <div className={styles.map}>
          {map}
          {panel}
        </div>
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
                    <ConceptSummary concept={child} />
                  </ClickableTile>
                </li>
              ))}
            </ul>
          )}
          {onAddConcept && <AddButton thing="Concept" onClick={onAddConcept} />}
        </nav>
      )}
      {view === 'list' && groups.length === 0 && (
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
