import { Launch } from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  InlineLoading,
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
  // The groups of Signals that say the same thing, each with its title and
  // the addresses of its Signals.
  groups?: ReadonlyArray<{ title: string; signals: ReadonlyArray<string> }>
  // The Hunch of a group that is on its way, or why it was not made. The
  // group is the address of its first Signal. While one is on its way, no
  // second one starts.
  hunch?: { group: string; pending?: string; failure?: string }
  // The addresses of the picked Signals, in the order of the list.
  onMakeInsight: (urls: Array<string>) => void
  // The addresses of the Signals of a group, in the order of the list.
  onMakeHunch: (urls: Array<string>) => void
  onOpenInsight?: (
    recordId: string,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void
}

// The Signals of a Project. A Signal that has no Insight can be picked: the
// one button makes an Insight from the picks. The filters show the Signals
// of the picked sources. No filter picked: all Signals. The groups come
// first, each under its title, with the button that turns it into a Hunch.
// A group shows when the filters show two of its Signals or more.
export function Signals({
  signals,
  failures = [],
  groups = [],
  hunch,
  onMakeInsight,
  onMakeHunch,
  onOpenInsight,
}: SignalsProps) {
  const listId = useId()
  const [picks, setPicks] = useState<ReadonlySet<string>>(new Set())
  const [filters, setFilters] = useState<ReadonlySet<string>>(new Set())
  const picked = signals.filter(
    ({ url, insight }) => insight === null && picks.has(url),
  )
  // The sources that gave a Signal or failed. A source that failed keeps its
  // filter. One order, whatever Signal is the newest.
  const sources = [
    ...new Set([...signals, ...failures].map(({ source }) => source)),
  ].sort((first, second) =>
    toSourceLabel(first).localeCompare(toSourceLabel(second)),
  )
  // A filter of a source that went away filters nothing.
  const active = new Set(sources.filter((source) => filters.has(source)))
  const shown =
    active.size === 0
      ? signals
      : signals.filter(({ source }) => active.has(source))
  const shownGroups = groups
    .map((group) => ({
      title: group.title,
      members: shown.filter(({ url }) => group.signals.includes(url)),
    }))
    .filter(({ members }) => members.length > 1)
  const grouped = new Set(shownGroups.flatMap(({ members }) => members))
  const single = shown.filter((signal) => !grouped.has(signal))

  const toggle = (current: ReadonlySet<string>, key: string, on: boolean) => {
    const next = new Set(current)
    if (on) next.add(key)
    else next.delete(key)
    return next
  }

  // A Signal that the filters hide is not picked any more.
  const changeFilter = (source: string, selected: boolean) => {
    const next = toggle(active, source, selected)
    setFilters(next)
    if (next.size === 0) return
    setPicks(
      (current) =>
        new Set(
          signals
            .filter((signal) => next.has(signal.source))
            .map(({ url }) => url)
            .filter((url) => current.has(url)),
        ),
    )
  }

  const toRow = ({ url, title, date, source, insight }: SignalRow) => (
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
        className={styles.signalTitle}
      >
        {title}
      </Link>
      <span className={`${styles.label} ${styles.source}`}>
        {toSourceLabel(source)}
      </span>
      <time dateTime={date} className={styles.label}>
        {date}
      </time>
      {insight && (
        <Link
          href={insight.href}
          className={styles.insight}
          onClick={
            onOpenInsight && ((event) => onOpenInsight(insight.id, event))
          }
        >
          {insight.id} {insight.title}
        </Link>
      )}
    </li>
  )

  return (
    <section aria-labelledby={listId} className={styles.group}>
      <h2 id={listId} className={styles.title}>
        Signals
      </h2>
      {failures.map(({ source, reason }) => {
        const label = toSourceLabel(source)
        // A reason that names its source stands alone.
        const named = reason.toLowerCase().includes(label.toLowerCase())
        return (
          <InlineNotification
            key={source}
            kind="error"
            lowContrast
            hideCloseButton
            className={styles.failure}
            title={named ? reason : label}
            subtitle={named ? undefined : reason}
          />
        )
      })}
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
                  selected={active.has(source)}
                  onChange={(selected: boolean) =>
                    changeFilter(source, selected)
                  }
                />
              ))}
            </div>
          )}
          {shownGroups.map(({ title, members }) => {
            const [first] = members
            const count = new Set(members.map(({ source }) => source)).size
            const own = hunch?.group === first.url ? hunch : undefined
            return (
              <div key={first.url} className={styles.repeat}>
                <div className={styles.repeatHead}>
                  <h3 className={styles.repeatTitle}>{title}</h3>
                  <span className={styles.label}>
                    {count} {count === 1 ? 'source' : 'sources'}
                  </span>
                  {own?.pending === undefined ? (
                    <Button
                      size="sm"
                      kind="ghost"
                      aria-label={`Make Hunch, ${title}`}
                      disabled={hunch?.pending !== undefined}
                      onClick={() => onMakeHunch(members.map(({ url }) => url))}
                    >
                      Make Hunch
                    </Button>
                  ) : (
                    <InlineLoading
                      description={own.pending}
                      className={styles.saving}
                    />
                  )}
                </div>
                {own?.failure && (
                  <InlineNotification
                    kind="error"
                    lowContrast
                    hideCloseButton
                    className={styles.failure}
                    title={own.failure}
                  />
                )}
                <ul className={styles.list}>{members.map(toRow)}</ul>
              </div>
            )
          })}
          {single.length > 0 && (
            <ul className={styles.list}>{single.map(toRow)}</ul>
          )}
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
