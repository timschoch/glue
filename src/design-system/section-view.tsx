import {
  Accordion,
  AccordionItem,
  ContentSwitcher,
  SelectableTag,
  Switch,
} from '@carbon/react'
import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

import { Card, signs } from './card.tsx'
import type { PartType, Trust } from './card.tsx'
import { TypeGroup, typeGroups } from './concept-view.tsx'
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
  // The Part types of the section. Each one has its group while a Part can
  // be added.
  types: ReadonlyArray<PartType>
  // The Parts of the whole Project that the section lists.
  parts: ReadonlyArray<SectionViewPart>
  // The slug of the one Concept that the filter picks.
  home?: string
  // With the callback the view holds one tag per Concept.
  onHomeChange?: (home: string | undefined) => void
  // Each Part shows as a card, the Strategic ones too.
  detail?: boolean
  // With the callback the head holds the switch between summary and detail.
  onDetailChange?: (detail: boolean) => void
  onOpen?: (part: SectionViewPart, event: MouseEvent<HTMLAnchorElement>) => void
  onAddPart?: (type: PartType) => void
  // One more group, after the Parts.
  children?: ReactNode
}

// One section in the main window: the Parts of the whole Project for its
// Part types. An Operational Part shows as a card in the group of its type.
// The Strategic Parts show as one row per home Concept. A click on the row
// opens their cards. The switch shows each Part as a card.
export function SectionView({
  title,
  types,
  parts,
  home,
  onHomeChange,
  detail = false,
  onDetailChange,
  onOpen,
  onAddPart,
  children,
}: SectionViewProps) {
  const concepts = groupByHome(parts)
  const listed =
    home === undefined ? parts : parts.filter((part) => part.home === home)
  const strategic = listed.filter(
    ({ flightLevel }) => flightLevel === 'strategic',
  )
  const cards = detail
    ? listed
    : listed.filter(({ flightLevel }) => flightLevel === 'operational')
  const groups = typeGroups
    .map((words) => ({
      ...words,
      parts: cards.filter(({ type }) => type === words.type),
      onAdd:
        onAddPart && types.includes(words.type)
          ? () => onAddPart(words.type)
          : undefined,
    }))
    .filter((group) => group.parts.length > 0 || group.onAdd)

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
        {onDetailChange && strategic.length > 0 && (
          <ContentSwitcher
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
      {onHomeChange && concepts.length > 1 && (
        <div role="group" aria-label="Concepts" className={styles.filter}>
          {concepts.map((concept) => (
            <SelectableTag
              key={concept.home}
              text={`${concept.title} ${concept.parts.length}`}
              selected={concept.home === home}
              onChange={(selected: boolean) =>
                onHomeChange(selected ? concept.home : undefined)
              }
            />
          ))}
        </div>
      )}
      {groups.map((group) => (
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
      {children}
    </div>
  )
}
