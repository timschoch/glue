import { Launch } from '@carbon/icons-react'
import { Button, Checkbox, Link } from '@carbon/react'
import { useId, useState } from 'react'
import type { MouseEvent } from 'react'

import styles from './signals.module.scss'

// One Signal: an item that stays in its tool, with its address there.
export type SignalRow = {
  url: string
  title: string
  // The day that the Signal came in: 2026-10-02.
  date: string
  // The Insight that grew from the Signal.
  insight: { id: string; title: string; href: string } | null
}

export type SignalsProps = {
  signals: ReadonlyArray<SignalRow>
  // Why there are no Signals. None: the tool has none.
  reason?: string | null
  // The addresses of the picked Signals, in the order of the list.
  onMakeInsight: (urls: Array<string>) => void
  onOpenInsight?: (
    recordId: string,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void
}

// The Signals of a Project. A Signal that has no Insight can be picked: the
// one button makes an Insight from the picks.
export function Signals({
  signals,
  reason,
  onMakeInsight,
  onOpenInsight,
}: SignalsProps) {
  const listId = useId()
  const [picks, setPicks] = useState<ReadonlySet<string>>(new Set())
  const picked = signals.filter(
    ({ url, insight }) => insight === null && picks.has(url),
  )

  const change = (url: string, checked: boolean) =>
    setPicks((current) => {
      const next = new Set(current)
      if (checked) next.add(url)
      else next.delete(url)
      return next
    })

  return (
    <section aria-labelledby={listId} className={styles.group}>
      <h2 id={listId} className={styles.title}>
        Signals
      </h2>
      {signals.length === 0 ? (
        <p className={styles.label}>{reason ?? 'No Signals'}</p>
      ) : (
        <>
          <ul className={styles.list}>
            {signals.map(({ url, title, date, insight }) => (
              <li key={url} className={styles.signal}>
                {insight ? (
                  <span />
                ) : (
                  <Checkbox
                    id={`${listId}-${url}`}
                    labelText={title}
                    hideLabel
                    checked={picks.has(url)}
                    onChange={(_, { checked }) => change(url, checked)}
                  />
                )}
                <Link
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  renderIcon={Launch}
                >
                  {title}
                </Link>
                <time dateTime={date} className={styles.label}>
                  {date}
                </time>
                {insight && (
                  <Link
                    href={insight.href}
                    onClick={
                      onOpenInsight &&
                      ((event) => onOpenInsight(insight.id, event))
                    }
                  >
                    {insight.id} {insight.title}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            className={styles.action}
            disabled={picked.length === 0}
            onClick={() => onMakeInsight(picked.map(({ url }) => url))}
          >
            Make Insight
          </Button>
        </>
      )}
    </section>
  )
}
