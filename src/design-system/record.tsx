import { Pin, PinFilled } from '@carbon/icons-react'
import {
  Button,
  IconButton,
  Link,
  Popover,
  PopoverContent,
} from '@carbon/react'
import { useEffect, useId, useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { MouseEvent, ReactNode } from 'react'
import type { Components } from 'react-markdown'

import { Card, evidenceLevels, partTypes, signs, workStates } from './card.tsx'
import styles from './record.module.scss'
import type { EvidenceLevel, PartType, Trust, WorkState } from './card.tsx'

// The number at the end of an issue address.
const ISSUE_NUMBER = /\d+$/

// What a card shows of a Part: `PartSummary` of the read model, with its
// Trust, its Work state and the place that opens it.
export type RecordPartSummary = {
  // The record id, for example D12.
  id: string
  type: PartType
  title: string
  // The name of the home Concept.
  concept: string
  trust: Trust
  workState?: WorkState
  href: string
}

// The Part at the other end of a Joint. A link joins a Part of another Concept.
export type RecordJointEnd = {
  jointId: number
  link: boolean
  part: RecordPartSummary
}

// One Part with all the record view shows: `Part` of the read model.
export type RecordPart = RecordPartSummary & {
  body: string
  owner: string | null
  date: string | null
  source: string | null
  metric: string | null
  enforcedBy: string | null
  evidenceLevel: EvidenceLevel | null
  issueUrl: string | null
  measure: {
    baseline: number | null
    latestValue: number | null
    target: number | null
    measuredAt: string | null
  } | null
  supersededBy: RecordPartSummary | null
  supersedes: ReadonlyArray<RecordPartSummary>
  needs: ReadonlyArray<RecordJointEnd>
  neededBy: ReadonlyArray<RecordJointEnd>
}

type OpenHandler = (
  recordId: string,
  event: MouseEvent<HTMLAnchorElement>,
) => void

// A node of the Markdown tree, as far as the record ids need it.
type MarkdownNode = {
  type: string
  value?: string
  url?: string
  data?: { hProperties: { recordId: string } }
  children?: Array<MarkdownNode>
}

// A record id in a text, with its `#`.
const RECORD_ID = /(#[A-Z]\d+\b)/

// A link has its own target, so a record id in it stays text.
const LINK_TYPES = new Set(['link', 'linkReference'])

// A body can hold text from outside, such as an issue. An image in it would
// tell its server who reads the record.
const disallowedElements = ['img']

// Turns each id of a known record in the texts below a node into a link.
function linkRecordIds(node: MarkdownNode, hrefs: Map<string, string>) {
  if (!node.children || LINK_TYPES.has(node.type)) return
  node.children = node.children.flatMap((child) => {
    if (child.type !== 'text' || child.value === undefined) {
      linkRecordIds(child, hrefs)
      return [child]
    }
    return child.value
      .split(RECORD_ID)
      .filter((text) => text !== '')
      .map((text): MarkdownNode => {
        const recordId = text.slice(1)
        const url = RECORD_ID.test(text) ? hrefs.get(recordId) : undefined
        return url === undefined
          ? { type: 'text', value: text }
          : {
              type: 'link',
              url,
              data: { hProperties: { recordId } },
              children: [{ type: 'text', value: text }],
            }
      })
  })
}

// The card of a Part. A Part that a link joins shows its home Concept. The
// minimal card is the one of a record id, whose link is the tab stop.
function PartCard({
  part,
  link = false,
  minimal = false,
  onOpen,
}: {
  part: RecordPartSummary
  link?: boolean
  minimal?: boolean
  onOpen?: OpenHandler
}) {
  return (
    <Card
      type={part.type}
      recordId={part.id}
      title={part.title}
      trust={part.trust}
      workState={part.workState}
      concept={link ? part.concept : undefined}
      minimal={minimal}
      href={part.href}
      tabIndex={minimal ? -1 : undefined}
      onOpen={onOpen && ((event) => onOpen(part.id, event))}
    />
  )
}

// A record id in the body: a link that shows the minimal card of its record
// while the pointer or the focus is on the link or on the card.
function RecordLink({
  part,
  onOpen,
  children,
}: {
  part: RecordPartSummary
  onOpen?: OpenHandler
  children: ReactNode
}) {
  // The edge of the link that the open card starts from. No edge: no card.
  const [align, setAlign] = useState<'bottom-start' | 'bottom-end'>()
  const open = align !== undefined

  // The card grows towards the wider side of the window, so it stays inside.
  const show = (link: HTMLElement) => {
    const { left, width } = link.getBoundingClientRect()
    const middle = document.documentElement.clientWidth / 2
    setAlign(left + width / 2 < middle ? 'bottom-start' : 'bottom-end')
  }

  // Escape closes the card, also when the pointer opened it.
  useEffect(() => {
    if (!open) return
    const close = ({ key }: KeyboardEvent) => {
      if (key === 'Escape') setAlign(undefined)
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [open])

  return (
    <Popover
      open={open}
      align={align}
      caret={false}
      onMouseEnter={({ currentTarget }) => show(currentTarget)}
      onMouseLeave={() => setAlign(undefined)}
      onFocus={({ currentTarget }) => show(currentTarget)}
      onBlur={({ currentTarget, relatedTarget }) => {
        if (!currentTarget.contains(relatedTarget)) setAlign(undefined)
      }}
    >
      <Link
        inline
        href={part.href}
        onClick={onOpen && ((event) => onOpen(part.id, event))}
      >
        {children}
      </Link>
      {open && (
        <PopoverContent className={styles.hoverCard}>
          <PartCard part={part} minimal onOpen={onOpen} />
        </PopoverContent>
      )}
    </Popover>
  )
}

// The body: Markdown, with the record ids of the known Parts as links.
function Body({
  body,
  parts,
  onOpen,
}: {
  body: string
  parts: ReadonlyArray<RecordPartSummary>
  onOpen?: OpenHandler
}) {
  const hrefs = useMemo(
    () => new Map(parts.map((part) => [part.id, part.href])),
    [parts],
  )
  const components = useMemo(
    (): Components => ({
      // The record title is the h1 of the page, so the text starts at h2.
      h1: 'h2',
      // The minimal card is a block, and a paragraph can not hold a block.
      p: ({ node, ...props }) => <div {...props} />,
      a: ({ node, href, children }) => {
        const part = parts.find(({ id }) => id === node?.properties.recordId)
        return part ? (
          <RecordLink part={part} onOpen={onOpen}>
            {children}
          </RecordLink>
        ) : (
          <Link inline href={href}>
            {children}
          </Link>
        )
      },
    }),
    [parts, onOpen],
  )

  return (
    <div className={styles.body}>
      <Markdown
        remarkPlugins={[
          remarkGfm,
          () => (tree: MarkdownNode) => linkRecordIds(tree, hrefs),
        ]}
        components={components}
        disallowedElements={disallowedElements}
      >
        {body}
      </Markdown>
    </div>
  )
}

// One group of cards with its title. A group with no item is left out.
function Group({
  title,
  ends,
  onOpen,
}: {
  title: string
  ends: ReadonlyArray<
    { key: string | number } & Omit<RecordJointEnd, 'jointId'>
  >
  onOpen?: OpenHandler
}) {
  const titleId = useId()
  if (ends.length === 0) return null

  return (
    <section aria-labelledby={titleId} className={styles.group}>
      <h2 id={titleId} className={styles.groupTitle}>
        {title}
      </h2>
      <ul className={styles.cards}>
        {ends.map(({ key, link, part }) => (
          <li key={key}>
            <PartCard part={part} link={link} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </section>
  )
}

const jointEnds = (ends: ReadonlyArray<RecordJointEnd>) =>
  ends.map(({ jointId, ...end }) => ({ key: jointId, ...end }))

const partEnds = (parts: ReadonlyArray<RecordPartSummary>) =>
  parts.map((part) => ({ key: part.id, link: false, part }))

export type RecordProps = {
  part: RecordPart
  // The Parts whose record ids the body names.
  bodyParts?: ReadonlyArray<RecordPartSummary>
  pinned: boolean
  onPinChange: (pinned: boolean) => void
  // Opens the record of a card or of a record id in the body.
  onOpen?: OpenHandler
  // The one button of the Work state.
  action?: { label: string; onClick: () => void }
}

// One Part in the main window: the head, the body, the type fields that have
// a value, and the Parts it is glued to as groups of cards.
export function Record({
  part,
  bodyParts = [],
  pinned,
  onPinChange,
  onOpen,
  action,
}: RecordProps) {
  const titleId = useId()
  const { word, Glyph, className } = signs[part.trust]
  const { measure, issueUrl } = part
  const issueNumber = issueUrl && ISSUE_NUMBER.exec(issueUrl)?.[0]
  const fields: Array<[string, ReactNode]> = [
    ['Metric', part.metric],
    ['Baseline', measure?.baseline],
    ['Latest value', measure?.latestValue],
    ['Target', measure?.target],
    ['Measured', measure?.measuredAt],
    ['Enforced by', part.enforcedBy],
    [
      'Evidence level',
      part.evidenceLevel && evidenceLevels[part.evidenceLevel],
    ],
    ['Source', part.source],
    [
      'Issue',
      issueUrl && (
        <Link href={issueUrl}>
          {issueNumber ? `#${issueNumber}` : issueUrl}
        </Link>
      ),
    ],
  ]
  const shownFields = fields.filter(([, value]) => value != null)

  return (
    <article aria-labelledby={titleId} className={styles.record}>
      <header className={styles.head}>
        <div className={styles.signs}>
          <Glyph className={className} />
          <span>{word}</span>
          <span>{partTypes[part.type]}</span>
          <span>{part.id}</span>
          <IconButton
            kind="ghost"
            size="sm"
            align="bottom-end"
            label="Pin"
            aria-pressed={pinned}
            wrapperClasses={styles.pin}
            onClick={() => onPinChange(!pinned)}
          >
            {pinned ? <PinFilled /> : <Pin />}
          </IconButton>
        </div>
        <h1 id={titleId} className={styles.title}>
          {part.title}
        </h1>
        {(part.workState || part.owner || part.date) && (
          <div className={styles.state}>
            {part.workState && <span>{workStates[part.workState]}</span>}
            {part.owner && <span>{part.owner}</span>}
            {part.date && <time dateTime={part.date}>{part.date}</time>}
          </div>
        )}
      </header>
      {action && (
        <Button className={styles.action} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {part.body.trim() !== '' && (
        <Body body={part.body} parts={bodyParts} onOpen={onOpen} />
      )}
      {shownFields.length > 0 && (
        <dl className={styles.fields}>
          {shownFields.map(([label, value]) => (
            <div key={label} className={styles.field}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <Group title="Needs" ends={jointEnds(part.needs)} onOpen={onOpen} />
      <Group
        title="Needed by"
        ends={jointEnds(part.neededBy)}
        onOpen={onOpen}
      />
      <Group
        title="Superseded by"
        ends={partEnds(part.supersededBy ? [part.supersededBy] : [])}
        onOpen={onOpen}
      />
      <Group
        title="Supersedes"
        ends={partEnds(part.supersedes)}
        onOpen={onOpen}
      />
    </article>
  )
}
