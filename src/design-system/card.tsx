import {
  CheckmarkFilled,
  ErrorFilled,
  Misuse,
  WarningAltFilled,
} from '@carbon/icons-react'
import { Button } from '@carbon/react'
import type { MouseEvent } from 'react'

import styles from './card.module.scss'

const partTypes = {
  insight: 'Insight',
  goal: 'Goal',
  decision: 'Decision',
  guardrail: 'Guardrail',
  entity: 'Entity',
  flow: 'Flow',
  metric: 'Metric',
} as const

export type PartType = keyof typeof partTypes

// Trust: its word, and the glyph of the sign slot.
const signs = {
  solid: { word: 'Solid', Glyph: CheckmarkFilled },
  flagged: { word: 'Flagged', Glyph: WarningAltFilled },
  'not-ready': { word: 'Not ready', Glyph: ErrorFilled },
  wrong: { word: 'Wrong', Glyph: Misuse },
} as const

export type Trust = keyof typeof signs

const evidenceLevels = {
  signal: 'Signal',
  hunch: 'Hunch',
  pattern: 'Pattern',
  confirmed: 'Confirmed',
} as const

export type EvidenceLevel = keyof typeof evidenceLevels

const workStates = {
  'to-check': 'To check',
  waiting: 'Waiting',
  draft: 'Draft',
  review: 'Review',
  published: 'Published',
} as const

export type WorkState = keyof typeof workStates

export type CardProps = {
  type: PartType
  recordId: string
  title: string
  trust: Trust
  // Only an Insight has one.
  evidenceLevel?: EvidenceLevel
  summary?: string
  // The Part types that the record needs and does not have.
  emptySlots?: ReadonlyArray<PartType>
  workState?: WorkState
  owner?: string
  // The minimal card: the sign, the type line and the title.
  minimal?: boolean
  href: string
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void
  action?: { label: string; onClick: () => void }
}

// The card of one Part. The whole card is one click target that opens the
// record. The one action button lies on the card, beside the click target.
export function Card({
  type,
  recordId,
  title,
  trust,
  evidenceLevel,
  summary,
  emptySlots = [],
  workState,
  owner,
  minimal = false,
  href,
  onOpen,
  action,
}: CardProps) {
  const { word, Glyph } = signs[trust]
  const button = minimal ? undefined : action

  return (
    <div className={styles.card}>
      <a
        href={href}
        onClick={onOpen}
        className={
          button ? `${styles.target} ${styles.aboveAction}` : styles.target
        }
      >
        <span className={styles.signs}>
          <Glyph aria-label={word} className={styles[trust]}>
            <title>{word}</title>
          </Glyph>
          <span>{partTypes[type]}</span>
          <span>{recordId}</span>
          {evidenceLevel && <span>{evidenceLevels[evidenceLevel]}</span>}
        </span>
        <p className={styles.title}>{title}</p>
        {!minimal && (
          <>
            {summary && <p className={styles.summary}>{summary}</p>}
            {emptySlots.length > 0 && (
              <span className={styles.emptySlots}>
                {emptySlots.map((slot) => (
                  <span key={slot} className={styles.emptySlot}>
                    {partTypes[slot]}
                  </span>
                ))}
              </span>
            )}
            {(workState || owner) && (
              <span className={styles.state}>
                {workState && <span>{workStates[workState]}</span>}
                {owner && <span className={styles.owner}>{owner}</span>}
              </span>
            )}
          </>
        )}
      </a>
      {button && (
        <Button
          kind="ghost"
          size="sm"
          className={styles.action}
          onClick={button.onClick}
        >
          {button.label}
        </Button>
      )}
    </div>
  )
}
