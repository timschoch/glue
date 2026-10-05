import { Launch } from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  InlineNotification,
  Link,
  SelectableTag,
} from '@carbon/react'
import { useId, useState } from 'react'
import type { MouseEvent } from 'react'

import styles from './signals.module.scss'

// One Signal: an item that stays in its tool, with its address there.
export type SignalRow = {
  url: string
  title: string
  // The day that the Signal came in: 2026-10-02.
  date: string
  // The name of the Signal source that gave it.
  source: string
  // The Insight that grew from the Signal.
  insight: { id: string; title: string; href: string } | null
}

// The Signal sources as a person reads them. A source with no label here
// shows its name.
const sourceLabels: Record<string, string> = {
  github: 'GitHub',
  support: 'Support',
  analytics: 'Analytics',
}

const toSourceLabel = (source: string) => sourceLabels[source] ?? source

export type SignalsProps = {
  signals: ReadonlyArray<SignalRow>
  // The sources that did not answer, and why.
  failures?: ReadonlyArray<{ source: string; reason: string }>
  // The addresses of the picked Signals, in the order of the list.
  onMakeInsight: (urls: Array<string>) => void
  onOpenInsight?: (
    recordId: string,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void
}

// The Signals of a Project. A Signal that has no Insight can be picked: the
// one button makes an Insight from the picks. The filters show the Signals
// of the picked sources. No filter picked: all Signals.
export function Signals({
  signals,
  failures = [],
  onMakeInsight,
  onOpenInsight,
}: SignalsProps) {
  const listId = useId()
  const [picks, setPicks] = useState<ReadonlySet<string>>(new Set())
  const [filters, setFilters] = useState<ReadonlySet<string>>(new Set())
  const picked = signals.filter(
    ({ url, insight }) => insight === null && picks.has(url),
  )
  // One order for the filters, whatever Signal is the newest.
  const sources = [...new Set(signals.map(({ source }) => source))].sort(
    (first, second) =>
      toSourceLabel(first).localeCompare(toSourceLabel(second)),
  )
  const shown =
    filters.size === 0
      ? signals
      : signals.filter(({ source }) => filters.has(source))

  const toggle = (current: ReadonlySet<string>, key: string, on: boolean) => {
    const next = new Set(current)
    if (on) next.add(key)
    else next.delete(key)
    return next
  }

  return (
    <section aria-labelledby={listId} className={styles.group}>
      <h2 id={listId} className={styles.title}>
        Signals
      </h2>
      {failures.map(({ source, reason }) => (
        <InlineNotification
          key={source}
          kind="error"
          lowContrast
          hideCloseButton
          title={toSourceLabel(source)}
          subtitle={reason}
        />
      ))}
      {signals.length === 0 ? (
        failures.length === 0 && <p className={styles.label}>No Signals</p>
      ) : (
        <>
          {sources.length > 1 && (
            <div role="group" aria-label="Source" className={styles.filters}>
              {sources.map((source) => (
                <SelectableTag
                  key={source}
                  text={toSourceLabel(source)}
                  selected={filters.has(source)}
                  onChange={(selected: boolean) =>
                    setFilters((current) => toggle(current, source, selected))
                  }
                />
              ))}
            </div>
          )}
          <ul className={styles.list}>
            {shown.map(({ url, title, date, source, insight }) => (
              <li key={url} className={styles.signal}>
                {insight ? (
                  <span />
                ) : (
                  <Checkbox
                    id={`${listId}-${url}`}
                    labelText={title}
                    hideLabel
                    checked={picks.has(url)}
                    onChange={(_, { checked }) =>
                      setPicks((current) => toggle(current, url, checked))
                    }
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
                <span className={styles.label}>{toSourceLabel(source)}</span>
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
