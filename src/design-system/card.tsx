import {
  CheckmarkFilled,
  ErrorFilled,
  Misuse,
  WarningAltFilled,
} from '@carbon/icons-react'
import type { CarbonIconType } from '@carbon/icons-react'
import { Button } from '@carbon/react'
import { Fragment } from 'react'
import type { MouseEvent } from 'react'

import styles from './card.module.scss'

export const partTypes = {
  insight: 'Insight',
  goal: 'Goal',
  decision: 'Decision',
  guardrail: 'Guardrail',
  entity: 'Entity',
  flow: 'Flow',
  metric: 'Metric',
} as const

export type PartType = keyof typeof partTypes

// Trust: its word, and the glyph of the sign slot with its style.
export const signs = {
  solid: { word: 'Solid', Glyph: CheckmarkFilled, className: styles.solid },
  flagged: {
    word: 'Flagged',
    Glyph: WarningAltFilled,
    className: styles.flagged,
  },
  'not-ready': {
    word: 'Not ready',
    Glyph: ErrorFilled,
    className: styles['not-ready'],
  },
  wrong: { word: 'Wrong', Glyph: Misuse, className: styles.wrong },
} as const

export type Trust = keyof typeof signs

export const evidenceLevels = {
  signal: 'Signal',
  hunch: 'Hunch',
  pattern: 'Pattern',
  confirmed: 'Confirmed',
} as const

export type EvidenceLevel = keyof typeof evidenceLevels

export const workStates = {
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
  // The name of the home Concept, of a linked Part only.
  concept?: string
  // The minimal card: the sign, the type line and the title.
  minimal?: boolean
  href: string
  // -1 on a card that repeats a link beside it.
  tabIndex?: number
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void
  // With a label, the button lies below the last line. With an icon, it shows
  // the icon at the end of the first line and the label names it.
  action?: { label: string; icon?: CarbonIconType; onClick: () => void }
}

// The card of one Part. The whole card is one click target that opens the
// record. The one action button lies on the card, beside the click target.
// The spaces between the slots are for the name of the link: the layout does
// not draw them.
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
  concept,
  minimal = false,
  href,
  tabIndex,
  onOpen,
  action,
}: CardProps) {
  const { word, Glyph, className } = signs[trust]
  const room = action?.icon ? styles.besideAction : styles.aboveAction

  return (
    <div className={styles.card}>
      <a
        href={href}
        tabIndex={tabIndex}
        onClick={onOpen}
        className={action ? `${styles.target} ${room}` : styles.target}
      >
        <span className={styles.signs}>
          <Glyph aria-label={word} className={className}>
            <title>{word}</title>
          </Glyph>{' '}
          <span>{partTypes[type]}</span> <span>{recordId}</span>
          {evidenceLevel && (
            <>
              {' '}
              <span>{evidenceLevels[evidenceLevel]}</span>
            </>
          )}
        </span>{' '}
        <p className={styles.title}>{title}</p>
        {!minimal && (
          <>
            {summary && (
              <>
                {' '}
                <p className={styles.summary}>{summary}</p>
              </>
            )}
            {emptySlots.length > 0 && (
              <span className={styles.emptySlots}>
                {emptySlots.map((slot) => (
                  <Fragment key={slot}>
                    {' '}
                    <span className={styles.emptySlot}>{partTypes[slot]}</span>
                  </Fragment>
                ))}
              </span>
            )}
            {(workState || owner) && (
              <span className={styles.state}>
                {workState && (
                  <>
                    {' '}
                    <span>{workStates[workState]}</span>
                  </>
                )}
                {owner && (
                  <>
                    {' '}
                    <span className={styles.owner}>{owner}</span>
                  </>
                )}
              </span>
            )}
            {concept && (
              <>
                {' '}
                <span className={styles.concept}>{concept}</span>
              </>
            )}
          </>
        )}
      </a>
      {action && (
        <div className={action.icon ? styles.iconAction : styles.action}>
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly={Boolean(action.icon)}
            renderIcon={action.icon}
            iconDescription={action.label}
            tooltipAlignment={action.icon ? 'end' : 'start'}
            onClick={action.onClick}
          >
            {action.icon ? undefined : action.label}
          </Button>
        </div>
      )}
    </div>
  )
}
