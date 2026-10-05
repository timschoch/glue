import {
  Accordion,
  AccordionItem,
  ContentSwitcher,
  Switch,
} from '@carbon/react'
import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

import { Card, partTypes, signs } from './card.tsx'
import type { PartType, Trust } from './card.tsx'
import { AddButton, TypeGroup, typeGroups } from './concept-view.tsx'
import type { PartCardsPart } from './part-cards.tsx'
import styles from './section-view.module.scss'

// A Part of a section, with what the member sees of it.
export type SectionViewPart = PartCardsPart & {
  // The slug of the home Concept.
  home: string
  flightLevel: 'operational' | 'strategic'
}

// Trust, the weakest last.
const trusts = Object.keys(signs) as Array<Trust>

// The Parts of each home Concept, in the order of the Parts.
function groupByHome(parts: ReadonlyArray<SectionViewPart>) {
  const homes = new Map<string, Array<SectionViewPart>>()
  for (const part of parts) {
    homes.set(part.home, [...(homes.get(part.home) ?? []), part])
  }
  return [...homes].map(([home, found]) => ({
    home,
    title: found[0].concept,
    parts: found,
  }))
}

// The row of one Concept: the weakest Trust of its Parts, its name and the
// count of the Parts. The open row shows the cards.
function SummaryRow({
  title,
  parts,
  cards,
}: {
  title: string
  parts: ReadonlyArray<SectionViewPart>
  cards: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const weakest = Math.max(...parts.map(({ trust }) => trusts.indexOf(trust)))
  const { word, Glyph, className } = signs[trusts[weakest]]

  return (
    <AccordionItem
      title={
        <span className={styles.row}>
          <Glyph aria-label={word} className={className}>
            <title>{word}</title>
          </Glyph>{' '}
          <span>{title}</span>{' '}
          <span className={styles.count}>{parts.length}</span>
        </span>
      }
      onHeadingClick={({ isOpen }) => setOpen(isOpen)}
    >
      {open && <ul className={styles.items}>{cards}</ul>}
    </AccordionItem>
  )
}

export type SectionViewProps = {
  title: string
  // The Part types of the section: a Part of each one can be added.
  types: ReadonlyArray<PartType>
  // The Parts that the section lists.
  parts: ReadonlyArray<SectionViewPart>
  // Each Part shows as a card, the Strategic ones too.
  detail?: boolean
  // With the callback the head holds the switch between summary and detail.
  onDetailChange?: (detail: boolean) => void
  onOpen?: (part: SectionViewPart, event: MouseEvent<HTMLAnchorElement>) => void
  onAddPart?: (type: PartType) => void
  // One more group, after the Parts.
  children?: ReactNode
}

// One section in the main window: the Parts for its Part types. An
// Operational Part shows as a card in the group of its type. The Strategic
// Parts show as one row per home Concept. A click on the row opens their
// cards. The switch shows each Part as a card. A type with no card has its
// add button after the rows, with no group: its Parts can be in the rows.
export function SectionView({
  title,
  types,
  parts,
  detail = false,
  onDetailChange,
  onOpen,
  onAddPart,
  children,
}: SectionViewProps) {
  const strategic = parts.filter(
    ({ flightLevel }) => flightLevel === 'strategic',
  )
  const cards = detail
    ? parts
    : parts.filter(({ flightLevel }) => flightLevel === 'operational')
  const groups = typeGroups.map((words) => ({
    ...words,
    parts: cards.filter(({ type }) => type === words.type),
    onAdd:
      onAddPart && types.includes(words.type)
        ? () => onAddPart(words.type)
        : undefined,
  }))
  const adds = groups.filter((group) => group.parts.length === 0 && group.onAdd)

  // The row names the Concept, so its cards do not.
  function card(part: SectionViewPart, inRow = false) {
    return (
      <Card
        key={part.id}
        type={part.type}
        recordId={part.id}
        title={part.title}
        trust={part.trust}
        reading={part.reading}
        workState={part.workState}
        concept={inRow ? undefined : part.concept}
        href={part.href}
        onOpen={onOpen && ((event) => onOpen(part, event))}
      />
    )
  }

  return (
    <div className={styles.view}>
      <header className={styles.head}>
        <h1 className={styles.title}>{title}</h1>
        {onDetailChange && (detail || strategic.length > 0) && (
          <ContentSwitcher
            aria-label="Flight level"
            size="sm"
            selectedIndex={detail ? 1 : 0}
            onChange={({ name }) => onDetailChange(name === 'detail')}
            className={styles.switch}
          >
            <Switch name="summary" text="Summary" />
            <Switch name="detail" text="Detail" />
          </ContentSwitcher>
        )}
      </header>
      {groups
        .filter((group) => group.parts.length > 0)
        .map((group) => (
          <TypeGroup
            key={group.type}
            type={group.type}
            many={group.many}
            cards={group.parts.map((part) => card(part))}
            onAdd={group.onAdd}
          />
        ))}
      {!detail && strategic.length > 0 && (
        <Accordion>
          {groupByHome(strategic).map((concept) => (
            <SummaryRow
              key={concept.home}
              title={concept.title}
              parts={concept.parts}
              cards={concept.parts.map((part) => (
                <li key={part.id}>{card(part, true)}</li>
              ))}
            />
          ))}
        </Accordion>
      )}
      {adds.length > 0 && (
        <div className={styles.buttons}>
          {adds.map(
            ({ type, onAdd }) =>
              onAdd && (
                <AddButton key={type} thing={partTypes[type]} onClick={onAdd} />
              ),
          )}
        </div>
      )}
      {children}
    </div>
  )
}
