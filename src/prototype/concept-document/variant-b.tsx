import { Button } from '@carbon/react'

import type { ConceptDocumentShape } from './document.ts'
import { EntryRow, LoopSteps, ReadingValue, nextLabel } from './shell.tsx'
import styles from './variant-b.module.scss'

// A box shows this many records. The count says how many it has.
const shown = 5

// PROTOTYPE, throwaway (design-system/D16). Variant B, Canvas: all areas at
// one time, as fixed boxes at fixed places like a form sheet. The place of a
// box shows what it relates to.
export function VariantB({ document }: { document: ConceptDocumentShape }) {
  const { title, areas, stepCounts, next } = document

  return (
    <article className={styles.canvas}>
      <h1 className={styles.title}>{title}</h1>
      <LoopSteps stepCounts={stepCounts} current={next?.step} />
      <div className={styles.sheet}>
        {areas.map((area) => {
          const label = nextLabel(next, area.type)
          const empty = area.entries.length === 0
          const single = area.type === 'goal' || area.type === 'metric'
          return (
            <section
              key={area.type}
              style={{ gridArea: area.type }}
              className={
                empty ? (label ? styles.nextBox : styles.emptyBox) : styles.box
              }
            >
              <header className={styles.head}>
                <h2>{area.name}</h2>
                {!single && !empty && (
                  <span className={styles.count}>{area.entries.length}</span>
                )}
              </header>
              {area.entries.slice(0, shown).map((entry) =>
                area.type === 'goal' ? (
                  <a key={entry.id} href={entry.href} className={styles.goal}>
                    {entry.title}
                  </a>
                ) : (
                  <div key={entry.id}>
                    <EntryRow entry={entry} />
                    <ReadingValue entry={entry} />
                  </div>
                ),
              )}
              {area.entries.length > shown && (
                <p className={styles.more}>+{area.entries.length - shown}</p>
              )}
              {label && (
                <Button size="sm" className={styles.action}>
                  {label}
                </Button>
              )}
            </section>
          )
        })}
      </div>
    </article>
  )
}
