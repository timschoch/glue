import { Button } from '@carbon/react'

import type {
  AreaType,
  ConceptDocumentShape,
  Entry,
  NextStep,
} from './document.ts'
import { EntryRow, LoopSteps, ReadingValue } from './shell.tsx'
import styles from './variant-c.module.scss'

// The cells of one thread, in the order of the loop. A cell with no record
// is a gap, and it names the Part that is missing.
const cells = [
  { key: 'evidence', missing: 'Insight', areas: ['insight', 'guardrail'] },
  { key: 'decision', missing: 'Decision', areas: ['decision'] },
  { key: 'design', missing: 'Flow', areas: ['flow', 'entity'] },
  { key: 'builds', missing: 'Build', areas: ['build'] },
] as const satisfies ReadonlyArray<{
  key: string
  missing: string
  areas: ReadonlyArray<AreaType>
}>

// PROTOTYPE, throwaway (design-system/D16). Variant C, Threads: rows that
// run through the loop steps. A row is one line of reasoning, from the
// evidence to the build. A gap in a row is a Part that is missing.
export function VariantC({ document }: { document: ConceptDocumentShape }) {
  const { title, groups, stepCounts, next } = document
  // The button of the next step goes into the first gap that it fills.
  let open = next

  const take = (...areas: ReadonlyArray<AreaType>): NextStep | undefined => {
    if (!open || !areas.includes(open.area)) return undefined
    const taken = open
    open = undefined
    return taken
  }

  const rows = groups.map(({ goal, metrics, threads }) => {
    const goalNext = goal ? undefined : take('goal')
    // A group with no Decision has one row, and all its cells are gaps.
    const lines = (threads.length > 0 ? threads : [undefined]).map(
      (thread) => ({
        id: thread?.decision.id ?? 'none',
        cells: cells.map(({ key, missing, areas }) => {
          const entries: ReadonlyArray<Entry> = !thread
            ? []
            : key === 'decision'
              ? [thread.decision]
              : thread[key]
          return {
            key,
            missing,
            entries,
            next: entries.length === 0 ? take(...areas) : undefined,
          }
        }),
      }),
    )
    const metricNext = take('metric')
    return { goal, goalNext, metrics, metricNext, lines }
  })

  return (
    <article className={styles.threads}>
      <h1 className={styles.title}>{title}</h1>
      <LoopSteps
        stepCounts={stepCounts}
        current={next?.step}
        next={open && <Button size="sm">{open.label}</Button>}
      />
      {rows.map(({ goal, goalNext, metrics, metricNext, lines }) => (
        <section key={goal?.id ?? 'none'} className={styles.group}>
          {goal ? (
            <a href={goal.href} className={styles.goal}>
              {goal.title}
            </a>
          ) : (
            <Gap name="Goal" next={goalNext} className={styles.goalGap} />
          )}
          <div
            className={styles.metric}
            style={{ gridRowEnd: `span ${lines.length + 1}` }}
          >
            {metrics.map((metric) => (
              <div key={metric.id} className={styles.cell}>
                <EntryRow entry={metric} />
                <ReadingValue entry={metric} />
                {metricNext && (
                  <Button size="sm" className={styles.action}>
                    {metricNext.label}
                  </Button>
                )}
              </div>
            ))}
            {metrics.length === 0 && <Gap name="Metric" next={metricNext} />}
          </div>
          {lines.map((line) => (
            <div
              key={line.id}
              className={
                line.id === 'none' ? styles.emptyThread : styles.thread
              }
            >
              {line.cells.map((cell) =>
                cell.entries.length > 0 ? (
                  <div key={cell.key} className={styles.cell}>
                    {cell.entries.map((entry) => (
                      <EntryRow key={entry.id} entry={entry} />
                    ))}
                  </div>
                ) : (
                  <Gap key={cell.key} name={cell.missing} next={cell.next} />
                ),
              )}
            </div>
          ))}
        </section>
      ))}
    </article>
  )
}

// A Part that is missing. The gap of the next step has the button.
function Gap({
  name,
  next,
  className,
}: {
  name: string
  next?: NextStep
  className?: string
}) {
  const gap = next ? styles.nextGap : styles.gap
  return (
    <div className={className ? `${gap} ${className}` : gap}>
      {next ? <Button size="sm">{next.label}</Button> : <span>{name}</span>}
    </div>
  )
}
