import { Edit, Launch, Pin, PinFilled, Subtract } from '@carbon/icons-react'
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
  TextArea,
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
import { StepBar } from './step-bar.tsx'
import { useHydrated } from './use-hydrated.ts'
import styles from './record.module.scss'
import type {
  CardProps,
  EvidenceLevel,
  PartType,
  Reading,
  Trust,
  WorkState,
} from './card.tsx'
import type { StepBarProps } from './step-bar.tsx'

// The number at the end of an issue address.
const ISSUE_NUMBER = /\d+$/

// The length of the day in an ISO time: 2026-10-02.
const DAY_LENGTH = 10

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
  // Only a Goal or a Metric has one.
  reading?: Reading
  href: string
}

// The Part at the other end of a Joint. A link joins a Part of another Concept.
export type RecordJointEnd = {
  jointId: number
  link: boolean
  part: RecordPartSummary
}

// Why a Part has a flag: what happened to the Part that it needs.
const flagReasons = {
  changed: 'Changed',
  'not-ready': 'Not ready',
  wrong: 'Wrong',
  'off-target': 'Off target',
} as const

// An open flag: its reason and the Part that caused it.
export type RecordFlag = {
  reason: keyof typeof flagReasons
  part: RecordPartSummary
}

// What happened to a Part: an edit, its first sign-off, or a flag that
// opened or closed.
const activityKinds = {
  changed: 'Edited',
  published: 'Published',
  'flag-opened': 'Flag opened',
  'flag-closed': 'Flag closed',
} as const

// One entry of the activity list, with its time as ISO.
export type RecordActivity = {
  kind: keyof typeof activityKinds
  at: string
  flag?: RecordFlag
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
  // The Signals that an Insight grew from, each with its address in its tool.
  signals: ReadonlyArray<{ url: string; title: string }>
  // The open flags, oldest first.
  flags: ReadonlyArray<RecordFlag>
  // What happened to the Part, newest first.
  activity: ReadonlyArray<RecordActivity>
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
      reading={part.reading}
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

// An action that runs with a click. An action that cannot be undone names
// the dialog that asks first: its title and the words of its button.
type ClickAction = {
  label: string
  onClick: () => void
  confirm?: { title: string; label: string }
}

// The search for the Part that an action needs: its label, and the run with
// the record id of the pick.
type PartPick = { label: string; onPick: (recordId: string) => void }

// One action on the record. An action with a pick asks for a Part first.
export type RecordAction = ClickAction | { label: string; pick: PartPick }

export type RecordProps = {
  part: RecordPart
  // The common flow that the Part is in, with its current step.
  flow?: StepBarProps
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
  // With it the box Next takes an answer in words, above the button.
  words?: { value: string; onChange: (value: string) => void }
  onEdit?: () => void
  // The Parts that a new Joint or the pick of an action can go to.
  jointParts?: ReadonlyArray<RecordPartSummary>
  // Adds a Joint from this Part to the Part of the record id.
  onAddJoint?: (recordId: string) => void
  onRemoveJoint?: (jointId: number) => void
  // What the tools outside Glue have on the Part. It comes before the
  // activity.
  children?: ReactNode
  // The Responsible and the Co-Authors of the Part.
  assignees?: ReactNode
}

// One Part in the main window: the head, the step bar of its flow, the box
// Next with the one button, the open flags, the body, the type fields that
// have a value, the Parts it is glued to as groups of cards, and what
// happened to it.
export function Record({
  part,
  flow,
  bodyParts = [],
  pinned,
  onPinChange,
  onOpen,
  actions = [],
  pending,
  error,
  words,
  onEdit,
  jointParts = [],
  onAddJoint,
  onRemoveJoint,
  children,
  assignees,
}: RecordProps) {
  const titleId = useId()
  const signalsId = useId()
  const searchId = useId()
  const nextId = useId()
  const wordsId = useId()
  const pickId = useId()
  const activityId = useId()
  // Carbon renders the closed menu of the button on the server and not in
  // the browser. So the menu comes after the page is hydrated.
  const hydrated = useHydrated()
  // The action that waits for the answer of its dialog.
  const [confirming, setConfirming] = useState<ClickAction>()
  // The pick that waits for its Part.
  const [picking, setPicking] = useState<PartPick>()
  const run = (action: RecordAction) => {
    if ('pick' in action) setPicking(action.pick)
    else if (action.confirm) setConfirming(action)
    else action.onClick()
  }
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
      {assignees}
      {flow && <StepBar {...flow} />}
      {(action || pending !== undefined || error !== undefined) && (
        <section aria-labelledby={nextId} className={styles.action}>
          <h2 id={nextId} className={styles.groupTitle}>
            Next
          </h2>
          {words && (
            <div className={styles.words}>
              <TextArea
                id={wordsId}
                labelText="Answer"
                rows={2}
                value={words.value}
                onChange={({ target }) => words.onChange(target.value)}
              />
            </div>
          )}
          {pending !== undefined ? (
            <InlineLoading description={pending} />
          ) : action && otherActions.length > 0 && hydrated ? (
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
          {picking && pending === undefined && (
            <div className={styles.search}>
              <PartSearch
                id={pickId}
                label={picking.label}
                parts={jointParts.filter(({ id }) => id !== part.id)}
                onPick={(recordId) => {
                  setPicking(undefined)
                  picking.onPick(recordId)
                }}
              />
            </div>
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
        </section>
      )}
      {part.flags.length > 0 && (
        <ul aria-label="Flags" className={styles.flags}>
          {part.flags.map(({ reason, part: cause }) => (
            <li key={`${cause.id} ${reason}`} className={styles.flag}>
              <span className={styles.reason}>{flagReasons[reason]}</span>
              <Card
                type={cause.type}
                recordId={cause.id}
                title={cause.title}
                trust={cause.trust}
                minimal
                href={cause.href}
                onOpen={onOpen && ((event) => onOpen(cause.id, event))}
              />
            </li>
          ))}
        </ul>
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
      {part.signals.length > 0 && (
        <section aria-labelledby={signalsId} className={styles.group}>
          <h2 id={signalsId} className={styles.groupTitle}>
            Signals
          </h2>
          <ul className={styles.group}>
            {part.signals.map(({ url, title }) => (
              <li key={url}>
                <Link
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  renderIcon={Launch}
                >
                  {title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
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
      {children}
      {part.activity.length > 0 && (
        <section aria-labelledby={activityId} className={styles.group}>
          <h2 id={activityId} className={styles.groupTitle}>
            Activity
          </h2>
          <ol className={styles.activity}>
            {part.activity.map(({ kind, at, flag }) => (
              <li key={`${at} ${kind} ${flag?.part.id}`}>
                <time dateTime={at}>{at.slice(0, DAY_LENGTH)}</time>
                <span>{activityKinds[kind]}</span>
                {flag && (
                  <>
                    <span>{flagReasons[flag.reason]}</span>
                    <Link
                      href={flag.part.href}
                      onClick={
                        onOpen && ((event) => onOpen(flag.part.id, event))
                      }
                    >
                      {flag.part.id}
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  )
}
