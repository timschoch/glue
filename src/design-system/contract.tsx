import { Button, InlineNotification, Link } from '@carbon/react'
import { useId } from 'react'
import type { MouseEvent, ReactNode } from 'react'

import { Card, partTypes } from './card.tsx'
import type { PartType, Trust } from './card.tsx'
import styles from './contract.module.scss'

// The length of the day in an ISO time: 2026-10-02.
const DAY_LENGTH = 10

// The start of a checksum is enough to tell two Versions apart in a row.
const SHORT_CHECKSUM_LENGTH = 12

export type ContractVersionRow = {
  version: number
  checksum: string
  signedBy: string
  // An ISO time.
  signedAt: string
}

export type ContractBlockingPart = {
  // The record id, for example F5.
  id: string
  type: PartType
  title: string
  trust: Trust
  href: string
}

export type ContractPanelProps = {
  // The newest Version first.
  versions: ReadonlyArray<ContractVersionRow>
  // The Parts changed after the newest Version.
  ahead: boolean
  // The Parts without Trust solid: they block the sign-off.
  blocking: ReadonlyArray<ContractBlockingPart>
  // The required slots of the Kind that are not filled: they block the
  // sign-off too.
  emptySlots: ReadonlyArray<EmptySlot>
  versionHref: (version: number) => string
  onOpenVersion?: (
    version: number,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void
  onOpenPart?: (
    part: ContractBlockingPart,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void
  onSignOff: () => void
  // Why the last sign-off failed.
  failure?: string
  // What the tools outside Glue have on the Contract. It comes after the
  // Versions.
  children?: ReactNode
}

function SignedBy({ signedBy, signedAt }: ContractVersionRow) {
  const day = signedAt.slice(0, DAY_LENGTH)

  return (
    <>
      <span>{signedBy}</span> <time dateTime={signedAt}>{day}</time>
    </>
  )
}

// A required slot that is not filled: the count of its Parts, and the count
// that it needs.
export type EmptySlot = { type: PartType; count: number; minCount: number }

// The empty slots as dashed chips, each with its Part type. A slot that
// needs more than one Part has its counts too.
function EmptySlots({ slots }: { slots: ReadonlyArray<EmptySlot> }) {
  if (slots.length === 0) return null

  return (
    <ul aria-label="Empty slots" className={styles.emptySlots}>
      {slots.map(({ type, count, minCount }) => (
        <li key={type} className={styles.emptySlot}>
          {minCount > 1
            ? `${partTypes[type]} ${count} of ${minCount}`
            : partTypes[type]}
        </li>
      ))}
    </ul>
  )
}

// The Contract of a Concept: its Contract Versions as a list, the mark of a
// Concept that is ahead, the Parts and the empty slots that block, and the
// one action. The action is there when the Concept has something to sign.
export function ContractPanel({
  versions,
  ahead,
  blocking,
  emptySlots,
  versionHref,
  onOpenVersion,
  onOpenPart,
  onSignOff,
  failure,
  children,
}: ContractPanelProps) {
  const titleId = useId()
  const blockingId = useId()

  return (
    <section aria-labelledby={titleId} className={styles.group}>
      <div className={styles.head}>
        <h2 id={titleId} className={styles.groupTitle}>
          Contract
        </h2>
        {ahead && <span className={styles.ahead}>Ahead</span>}
      </div>
      {versions.length > 0 && (
        <ul className={styles.versions}>
          {versions.map((row) => (
            <li key={row.version}>
              <a
                href={versionHref(row.version)}
                onClick={
                  onOpenVersion &&
                  ((event) => onOpenVersion(row.version, event))
                }
                className={styles.row}
              >
                <span className={styles.version}>Version {row.version}</span>{' '}
                <code className={styles.checksum}>
                  {row.checksum.slice(0, SHORT_CHECKSUM_LENGTH)}
                </code>{' '}
                <SignedBy {...row} />
              </a>
            </li>
          ))}
        </ul>
      )}
      {children}
      {blocking.length > 0 && (
        <div className={styles.group}>
          <p id={blockingId} className={styles.label}>
            Blocking
          </p>
          <ul aria-labelledby={blockingId} className={styles.cards}>
            {blocking.map((part) => (
              <li key={part.id}>
                <Card
                  minimal
                  type={part.type}
                  recordId={part.id}
                  title={part.title}
                  trust={part.trust}
                  href={part.href}
                  onOpen={onOpenPart && ((event) => onOpenPart(part, event))}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      <EmptySlots slots={emptySlots} />
      {failure && (
        <InlineNotification
          lowContrast
          hideCloseButton
          role="alert"
          kind="error"
          title={failure}
        />
      )}
      {(ahead || versions.length === 0) && (
        <Button
          size="md"
          className={styles.action}
          disabled={blocking.length > 0 || emptySlots.length > 0}
          onClick={onSignOff}
        >
          Sign off
        </Button>
      )}
    </section>
  )
}

export type ContractFrozenPart = {
  id: string
  type: PartType
  title: string
  body: string
}

export type ContractVersionViewProps = {
  contract: ContractVersionRow & {
    // The title of the Concept.
    title: string
    // The slug of its Kind.
    kind: string | null
    // A higher number than `version`: this Version is superseded.
    newestVersion: number
    // What a coding agent reads.
    tier1: ReadonlyArray<ContractFrozenPart>
    // The why.
    tier2: ReadonlyArray<ContractFrozenPart>
    // One slot per Part type of the Kind.
    slots: ReadonlyArray<{
      type: PartType
      required: boolean
      filled: boolean
    }>
  }
  newestHref: string
  onOpenNewest?: (event: MouseEvent<HTMLAnchorElement>) => void
}

function Tier({
  title,
  parts,
}: {
  title: string
  parts: ReadonlyArray<ContractFrozenPart>
}) {
  const titleId = useId()
  if (parts.length === 0) return null

  return (
    <section aria-labelledby={titleId} className={styles.group}>
      <h2 id={titleId} className={styles.groupTitle}>
        {title}
      </h2>
      <ul className={styles.group}>
        {parts.map((part) => (
          <li key={part.id} className={styles.part}>
            <span className={styles.signs}>
              <span>{partTypes[part.type]}</span> <span>{part.id}</span>
            </span>
            <h3 className={styles.partTitle}>{part.title}</h3>
            {part.body.trim() !== '' && (
              <p className={styles.body}>{part.body}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

// One Contract Version in the main window: the frozen Parts as text, tier 1
// before tier 2. A frozen Version is read-only, so it has no control. A
// superseded Version names the newest one.
export function ContractVersionView({
  contract,
  newestHref,
  onOpenNewest,
}: ContractVersionViewProps) {
  const emptySlots = contract.slots
    .filter(({ required, filled }) => required && !filled)
    .map(({ type }) => ({ type, count: 0, minCount: 1 }))

  return (
    <div className={styles.view}>
      <header className={styles.group}>
        <span className={styles.label}>
          Contract Version {contract.version}
        </span>
        <h1 className={styles.title}>{contract.title}</h1>
        <div className={styles.state}>
          <code className={styles.checksum}>{contract.checksum}</code>{' '}
          <SignedBy {...contract} />
        </div>
        {contract.newestVersion > contract.version && (
          <div className={styles.state}>
            <span>Superseded by</span>
            <Link href={newestHref} onClick={onOpenNewest}>
              Version {contract.newestVersion}
            </Link>
          </div>
        )}
        <EmptySlots slots={emptySlots} />
      </header>
      <Tier title="Tier 1" parts={contract.tier1} />
      <Tier title="Tier 2" parts={contract.tier2} />
    </div>
  )
}
