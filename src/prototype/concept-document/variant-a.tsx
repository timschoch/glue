import { Button } from '@carbon/react'

import { steps } from './document.ts'
import type { ConceptDocumentShape } from './document.ts'
import { EntryRow, LoopSteps, ReadingValue, nextLabel } from './shell.tsx'
import styles from './variant-a.module.scss'

// PROTOTYPE, throwaway (design-system/D16). Variant A, Page: one long
// document. Each loop step is a chapter, each area has its fixed place, and
// an empty area is a dashed slot at that place.
export function VariantA({ document }: { document: ConceptDocumentShape }) {
  const { title, areas, stepCounts, next } = document

  return (
    <article className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <LoopSteps
        stepCounts={stepCounts}
        current={next?.step}
        className={styles.loop}
      />
      {steps.map((step) => (
        <section key={step} id={step} className={styles.chapter}>
          <h2 className={styles.step}>{step}</h2>
          <div className={styles.areas}>
            {areas
              .filter((area) => area.step === step)
              .map((area) => {
                const label = nextLabel(next, area.type)
                const empty = area.entries.length === 0
                return (
                  <section
                    key={area.type}
                    className={
                      empty
                        ? label
                          ? styles.nextSlot
                          : styles.slot
                        : styles.area
                    }
                  >
                    <header className={styles.head}>
                      <h3>{area.name}</h3>
                      {label && <Button size="sm">{label}</Button>}
                    </header>
                    {area.entries.map((entry) => (
                      <div key={entry.id}>
                        <EntryRow entry={entry} withId withNeeds />
                        <ReadingValue entry={entry} />
                      </div>
                    ))}
                  </section>
                )
              })}
          </div>
        </section>
      ))}
    </article>
  )
}
