import { Launch } from '@carbon/icons-react'
import { Link } from '@carbon/react'
import { useId } from 'react'
import type { MouseEvent } from 'react'

import { Card, signs } from './card.tsx'
import type { PartType, Trust, WorkState } from './card.tsx'
import styles from './builds.module.scss'

// A Decision that a build names.
export type BuildPart = {
  // The record id, for example D28.
  id: string
  type: PartType
  title: string
  trust: Trust
  workState?: WorkState
  href: string
}

// The Contract Version that a build names.
export type BuildContract = { title: string; version: number; href: string }

// One build: a pull request that stays in GitHub, with its address there.
export type BuildRow = {
  number: number
  url: string
  title: string
  state: keyof typeof states
  decisions: ReadonlyArray<BuildPart>
  contract: BuildContract | null
  // Its Contract Version is old, or a Decision of it is sunk.
  stale: boolean
  // The newest result of its gate. None: no gate checked it.
  gate: keyof typeof gateSigns | null
}

const states = { open: 'Open', merged: 'Merged' } as const

// Holds or breaks, with the signs of Trust.
const gateSigns = {
  holds: { ...signs.solid, word: 'Holds' },
  breaks: { ...signs['not-ready'], word: 'Breaks' },
}

function GateSign({ gate }: { gate: keyof typeof gateSigns }) {
  const { word, Glyph, className } = gateSigns[gate]

  return (
    <Glyph aria-label={word} className={className}>
      <title>{word}</title>
    </Glyph>
  )
}

export type BuildsProps = {
  builds: ReadonlyArray<BuildRow>
  // Why there are no builds. None: the repository has none.
  reason?: string | null
  onOpenPart?: (part: BuildPart, event: MouseEvent<HTMLAnchorElement>) => void
  onOpenContract?: (
    contract: BuildContract,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void
}

// The builds of a Project: each one with the sign of its gate, its link out,
// its state, the stale mark, and the Decisions and the Contract Version that
// it names.
export function Builds({
  builds,
  reason,
  onOpenPart,
  onOpenContract,
}: BuildsProps) {
  const listId = useId()

  return (
    <section aria-labelledby={listId} className={styles.group}>
      <h2 id={listId} className={styles.title}>
        Builds
      </h2>
      {builds.length === 0 ? (
        <p className={styles.label}>{reason ?? 'No builds'}</p>
      ) : (
        <ul className={styles.list}>
          {builds.map(
            ({ number, url, title, state, stale, gate, ...named }) => (
              <li key={number} className={styles.build}>
                <span className={styles.sign}>
                  {gate && <GateSign gate={gate} />}
                </span>
                <Link
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  renderIcon={Launch}
                >
                  {title}
                </Link>
                <span className={styles.label}>{states[state]}</span>
                <span className={styles.stale}>{stale && 'Stale'}</span>
                <div className={styles.named}>
                  {named.decisions.map((part) => (
                    <Card
                      key={part.id}
                      minimal
                      type={part.type}
                      recordId={part.id}
                      title={part.title}
                      trust={part.trust}
                      workState={part.workState}
                      href={part.href}
                      onOpen={
                        onOpenPart && ((event) => onOpenPart(part, event))
                      }
                    />
                  ))}
                  {named.contract && (
                    <Link
                      href={named.contract.href}
                      onClick={
                        onOpenContract &&
                        ((event) =>
                          named.contract &&
                          onOpenContract(named.contract, event))
                      }
                    >
                      {named.contract.title} Version {named.contract.version}
                    </Link>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  )
}
