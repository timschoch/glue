import { Add } from '@carbon/icons-react'
import { Button, ClickableTile } from '@carbon/react'
import type { ReactNode } from 'react'

import { Card, partTypes } from './card.tsx'
import type { PartType } from './card.tsx'
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  layoutLayers,
  layoutMap,
} from './concept-map-layout.ts'
import type { MapJoint } from './concept-map-layout.ts'
import styles from './concept-map.module.scss'
import type { ConceptViewProps } from './concept-view.tsx'

// The highest layer of each Part type: a Part is below the Parts it needs.
const ranks: Record<PartType, number> = {
  goal: 0,
  insight: 0,
  decision: 1,
  flow: 2,
  entity: 2,
  guardrail: 3,
  metric: 3,
}

// The Concepts inside are below all Parts.
const CONCEPT_RANK = 4

export type ConceptMapProps = Pick<
  ConceptViewProps,
  | 'types'
  | 'partHref'
  | 'conceptHref'
  | 'onOpenPart'
  | 'onOpenConcept'
  | 'onAddPart'
> & {
  concept: Pick<
    ConceptViewProps['concept'],
    'concepts' | 'parts' | 'linkedParts' | 'slots'
  > & {
    // `part` needs `needs`: the record ids of two Parts.
    joints: ReadonlyArray<MapJoint>
  }
}

// The map of one Concept: its Parts as nodes, its Joints as lines. A Part is
// below the Parts that it needs. A Part of another Concept names its Concept.
// An empty slot of the Kind is a dashed node. A Concept inside is a surface
// with its name.
export function ConceptMap({
  concept,
  types,
  partHref,
  conceptHref,
  onOpenPart,
  onOpenConcept,
  onAddPart,
}: ConceptMapProps) {
  const inLens = ({ type }: { type: PartType }) =>
    types === undefined || types.includes(type)

  const nodes: Array<{ id: string; rank: number; content: ReactNode }> = [
    ...concept.parts.filter(inLens).map((part) => ({ part, linked: false })),
    ...concept.linkedParts
      .filter(inLens)
      .map((part) => ({ part, linked: true })),
  ].map(({ part, linked }) => ({
    id: part.id,
    rank: ranks[part.type],
    content: (
      <Card
        type={part.type}
        recordId={part.id}
        title={part.title}
        trust={part.trust}
        concept={linked ? part.conceptTitle : undefined}
        minimal={!linked}
        href={partHref(part)}
        onOpen={onOpenPart && ((event) => onOpenPart(part, event))}
      />
    ),
  }))

  for (const { type, filled } of concept.slots) {
    if (filled || !inLens({ type })) continue
    nodes.push({
      id: `slot:${type}`,
      rank: ranks[type],
      content: (
        <div className={styles.emptySlot}>
          {onAddPart ? (
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Add}
              onClick={() => onAddPart(type)}
            >
              Add {partTypes[type]}
            </Button>
          ) : (
            <span className={styles.slotType}>{partTypes[type]}</span>
          )}
        </div>
      ),
    })
  }

  for (const child of concept.concepts) {
    nodes.push({
      id: `concept:${child.slug}`,
      rank: CONCEPT_RANK,
      content: (
        <ClickableTile
          href={conceptHref(child)}
          onClick={onOpenConcept && ((event) => onOpenConcept(child, event))}
          className={styles.surface}
        >
          <span className={styles.conceptTitle}>{child.title}</span>
          <span className={styles.label}>
            {child.partCount} {child.partCount === 1 ? 'Part' : 'Parts'}
          </span>
        </ClickableTile>
      ),
    })
  }

  // A lens with no Part type has no words about Parts.
  if (nodes.length === 0) {
    return types?.length === 0 ? null : <p className={styles.label}>No Parts</p>
  }

  const layers = layoutLayers(nodes, concept.joints)
  const { width, height, places, lines } = layoutMap(layers, concept.joints)
  const contents = new Map(nodes.map(({ id, content }) => [id, content]))

  return (
    <div className={styles.map}>
      <div
        className={styles.plan}
        style={{ width: `${width}rem`, height: `${height}rem` }}
      >
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${width} ${height}`}
          className={styles.lines}
        >
          {lines.map(({ id, path }) => (
            <path key={id} d={path} className={styles.line} />
          ))}
        </svg>
        <ul>
          {layers.flat().map((id) => (
            <li
              key={id}
              className={styles.node}
              style={{
                top: `${places[id].top}rem`,
                left: `${places[id].left}rem`,
                width: `${NODE_WIDTH}rem`,
                height: `${NODE_HEIGHT}rem`,
              }}
            >
              {contents.get(id)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
