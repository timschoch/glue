import { Edit, Pin, PinFilled, Subtract } from '@carbon/icons-react'
import {
  Button,
  ComboButton,
  IconButton,
  InlineLoading,
  InlineNotification,
  Link,
  MenuItem,
  Modal,
  Popover,
  PopoverContent,
} from '@carbon/react'
import { useEffect, useId, useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { MouseEvent, ReactNode } from 'react'
import type { Components } from 'react-markdown'
import type { MarkdownNode } from '../mention.ts'

import { replaceMentions } from '../mention.ts'
import { Card, evidenceLevels, partTypes, signs, workStates } from './card.tsx'
import { PartSearch } from './part-search.tsx'
import styles from './record.module.scss'
import type {
  CardProps,
  EvidenceLevel,
  PartType,
  Trust,
  WorkState,
} from './card.tsx'

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

// A body can hold text from outside, such as an issue. An image in it would
// tell its server who reads the record.
const disallowedElements = ['img']

// Turns each id of a known record in the texts below a node into a link.
function linkRecordIds(node: MarkdownNode, hrefs: Map<string, string>) {
  replaceMentions(node, ({ project, recordId }) => {
    const url = project === undefined ? hrefs.get(recordId) : undefined
    return url === undefined
      ? undefined
      : {
          type: 'link',
          url,
          data: { hProperties: { recordId } },
          children: [{ type: 'text', value: `#${recordId}` }],
        }
  })
}

// The card of a Part. A Part that a link joins shows its home Concept. The
// minimal card is the one of a record id, whose link is the tab stop.
function PartCard({
  part,
  link = false,
  minimal = false,
  onOpen,
  action,
}: {
  part: RecordPartSummary
  link?: boolean
  minimal?: boolean
  onOpen?: OpenHandler
  action?: CardProps['action']
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
      action={action}
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

// One group of cards with its title, and the search that adds to it. A group
// with no item and no search is left out. Only a Joint can be removed.
function Group({
  title,
  ends,
  onOpen,
  onRemoveJoint,
  children,
}: {
  title: string
  ends: ReadonlyArray<{
    part: RecordPartSummary
    jointId?: number
    link?: boolean
  }>
  onOpen?: OpenHandler
  onRemoveJoint?: (jointId: number) => void
  children?: ReactNode
}) {
  const titleId = useId()
  if (ends.length === 0 && !children) return null

  return (
    <section aria-labelledby={titleId} className={styles.group}>
      <h2 id={titleId} className={styles.groupTitle}>
        {title}
      </h2>
      {ends.length > 0 && (
        <ul className={styles.cards}>
          {ends.map(({ part, jointId, link }) => (
            <li key={jointId ?? part.id}>
              <PartCard
                part={part}
                link={link}
                onOpen={onOpen}
                action={
                  onRemoveJoint && jointId !== undefined
                    ? {
                        label: `Remove ${part.id}`,
                        icon: Subtract,
                        onClick: () => onRemoveJoint(jointId),
                      }
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
      {children}
    </section>
  )
}

const partEnds = (parts: ReadonlyArray<RecordPartSummary>) =>
  parts.map((part) => ({ part }))

// One action on the record. An action that cannot be undone names the dialog
// that asks first: its title and the words of its button.
export type RecordAction = {
  label: string
  onClick: () => void
  confirm?: { title: string; label: string }
}

export type RecordProps = {
  part: RecordPart
  // The Parts whose record ids the body names.
  bodyParts?: ReadonlyArray<RecordPartSummary>
  pinned: boolean
  onPinChange: (pinned: boolean) => void
  // Opens the record of a card or of a record id in the body.
  onOpen?: OpenHandler
  // The first action is the button. The others are in its menu.
  actions?: ReadonlyArray<RecordAction>
  // The words of the action that runs. They take the place of the button.
  pending?: string
  // Why the last action failed.
  error?: string
  onEdit?: () => void
  // The Parts that a new Joint can go to.
  jointParts?: ReadonlyArray<RecordPartSummary>
  // Adds a Joint from this Part to the Part of the record id.
  onAddJoint?: (recordId: string) => void
  onRemoveJoint?: (jointId: number) => void
}

// One Part in the main window: the head, the body, the type fields that have
// a value, and the Parts it is glued to as groups of cards.
export function Record({
  part,
  bodyParts = [],
  pinned,
  onPinChange,
  onOpen,
  actions = [],
  pending,
  error,
  onEdit,
  jointParts = [],
  onAddJoint,
  onRemoveJoint,
}: RecordProps) {
  const titleId = useId()
  const searchId = useId()
  // The action that waits for the answer of its dialog.
  const [confirming, setConfirming] = useState<RecordAction>()
  const run = (action: RecordAction) =>
    action.confirm ? setConfirming(action) : action.onClick()
  const action = actions.at(0)
  const otherActions = actions.slice(1)
  // A Part has one Joint to another Part at most, and none to itself.
  const joined = new Set([
    part.id,
    ...[...part.needs, ...part.neededBy].map((end) => end.part.id),
  ])
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
          <div className={styles.controls}>
            {onEdit && (
              <IconButton
                kind="ghost"
                size="sm"
                align="bottom-end"
                label="Edit"
                onClick={onEdit}
              >
                <Edit />
              </IconButton>
            )}
            <IconButton
              kind="ghost"
              size="sm"
              align="bottom-end"
              label="Pin"
              aria-pressed={pinned}
              onClick={() => onPinChange(!pinned)}
            >
              {pinned ? <PinFilled /> : <Pin />}
            </IconButton>
          </div>
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
      {(action || pending !== undefined || error !== undefined) && (
        <div className={styles.action}>
          {pending !== undefined ? (
            <InlineLoading description={pending} />
          ) : action && otherActions.length > 0 ? (
            <ComboButton label={action.label} onClick={() => run(action)}>
              {otherActions.map((other) => (
                <MenuItem
                  key={other.label}
                  label={other.label}
                  onClick={() => run(other)}
                />
              ))}
            </ComboButton>
          ) : (
            action && (
              <Button onClick={() => run(action)}>{action.label}</Button>
            )
          )}
          {error !== undefined && (
            <InlineNotification
              kind="error"
              role="alert"
              lowContrast
              hideCloseButton
              title={error}
            />
          )}
        </div>
      )}
      {confirming?.confirm && (
        <Modal
          open
          danger
          size="xs"
          modalHeading={confirming.confirm.title}
          primaryButtonText={confirming.confirm.label}
          secondaryButtonText="Cancel"
          onRequestSubmit={() => {
            setConfirming(undefined)
            confirming.onClick()
          }}
          onRequestClose={() => setConfirming(undefined)}
        />
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
      <Group
        title="Needs"
        ends={part.needs}
        onOpen={onOpen}
        onRemoveJoint={onRemoveJoint}
      >
        {onAddJoint && (
          <div className={styles.search}>
            <PartSearch
              id={searchId}
              label="Add Joint"
              parts={jointParts.filter(({ id }) => !joined.has(id))}
              onPick={onAddJoint}
            />
          </div>
        )}
      </Group>
      <Group
        title="Needed by"
        ends={part.neededBy}
        onOpen={onOpen}
        onRemoveJoint={onRemoveJoint}
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
