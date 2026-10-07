import {
  ChevronDown,
  ChevronUp,
  Edit,
  Launch,
  Pin,
  PinFilled,
  Subtract,
  View,
  ViewFilled,
} from '@carbon/icons-react'
import {
  Button,
  IconButton,
  InlineLoading,
  Link,
  Popover,
  PopoverContent,
  Select,
  SelectItem,
} from '@carbon/react'
import { useEffect, useId, useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { MouseEvent, ReactNode } from 'react'
import type { Components } from 'react-markdown'
import type { MarkdownNode } from '../mention.ts'

import { replaceMentions } from '../mention.ts'
import { Card, evidenceLevels, partTypes, signs, workStates } from './card.tsx'
import { NextBox } from './next-box.tsx'
import { PartSearch } from './part-search.tsx'
import { StepBar } from './step-bar.tsx'
import styles from './record.module.scss'
import type { NextAction } from './next-box.tsx'
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
  // The name of the Project of the Part. Only a reference has one: a Joint
  // to a Part of another Project.
  project?: string
  part: RecordPartSummary
}

// Why a Part has a flag: what happened to the Part that it needs.
export const flagReasons = {
  changed: 'Changed',
  'not-ready': 'Not ready',
  wrong: 'Wrong',
  'off-target': 'Off target',
  'new-version': 'New Version',
} as const

// Why a Part is unsure with no flag: what it needs and does not have.
const slotReasons = {
  goal: 'Needs a Goal',
  evidence: 'Needs evidence',
  decision: 'Needs a Decision',
} as const

// The fields of a Part that a Contract Version holds.
const frozenFields = {
  type: 'Type',
  title: 'Title',
  body: 'Body',
  concept: 'Concept',
  status: 'Status',
  owner: 'Owner',
  date: 'Date',
  source: 'Source',
  metric: 'Metric',
  enforcedBy: 'Enforced by',
  evidenceLevel: 'Evidence level',
  needs: 'Needs',
  steps: 'Steps',
  fields: 'Fields',
} as const

// An open flag: its reason and the Part that caused it.
export type RecordFlag = {
  reason: keyof typeof flagReasons
  part: RecordPartSummary
  // Only a flag of a new Contract Version has it: the Version that the
  // Joint was built with, the newest Version, and each field of the needed
  // Part that the two hold with another value.
  contract?: {
    builtWith: number
    newest: number
    changes: ReadonlyArray<{
      field: keyof typeof frozenFields
      before: string | null
      after: string | null
    }>
  }
}

// What happened to a Part: a step of its Work state, an edit, a wording
// fix, a step of its Evidence level, or a flag that opened or closed.
const activityKinds = {
  ...workStates,
  changed: 'Edited',
  wording: 'Wording',
  raised: 'Raised',
  verified: 'Verified',
  disputed: 'Disputed',
  'flag-opened': 'Flag opened',
  'flag-closed': 'Flag closed',
} as const

// One step of a Flow. `entity` is the record id of the Entity that the step
// works on.
export type RecordStep = { text: string; entity: string | null }

// One field of an Entity.
export type RecordField = { name: string; meaning: string }

// A Part as one sign-off froze it: `PartVersion` of the read model.
export type RecordVersion = {
  version: number
  title: string
  body: string
  owner: string | null
  date: string | null
  source: string | null
  metric: string | null
  enforcedBy: string | null
  evidenceLevel: EvidenceLevel | null
  steps: ReadonlyArray<RecordStep>
  fields: ReadonlyArray<RecordField>
}

// A note that is a link to the web and nothing else.
const WEB_LINK = /^https?:\/\/\S+$/

// One entry of the activity list, with its time as ISO. `by` is the name of
// the member who did it. A sign-off has the Version that it stored. A step
// of the Evidence level has a note: what was tested, or the reason.
export type RecordActivity = {
  kind: keyof typeof activityKinds
  at: string
  by?: string
  note?: string
  flag?: RecordFlag
  version?: RecordVersion
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
  // The level of the strongest evidence of a Decision.
  evidenceBase?: EvidenceLevel | null
  // The steps of a Flow, in their order.
  steps: ReadonlyArray<RecordStep>
  // The fields of an Entity.
  fields: ReadonlyArray<RecordField>
  issueUrl: string | null
  measure: {
    baseline: number | null
    latestValue: number | null
    target: number | null
    measuredAt: string | null
  } | null
  supersededBy: RecordPartSummary | null
  supersedes: ReadonlyArray<RecordPartSummary>
  // The Metrics of the Goal that a Decision needs, each with its reading.
  goalMetrics?: ReadonlyArray<RecordPartSummary>
  needs: ReadonlyArray<RecordJointEnd>
  neededBy: ReadonlyArray<RecordJointEnd>
  // The Signals that an Insight grew from, each with its address in its tool.
  signals: ReadonlyArray<{ url: string; title: string }>
  // The open flags, oldest first.
  flags: ReadonlyArray<RecordFlag>
  // What the Part needs and does not have.
  emptySlots?: ReadonlyArray<keyof typeof slotReasons>
  // The Parts under review that the Part needs.
  reviewNotes?: ReadonlyArray<RecordPartSummary>
  // What happened to the Part, newest first.
  activity: ReadonlyArray<RecordActivity>
  // What a Decision asks: its options, the pick of its author and the answer
  // that it got. `pick` and `option` count the options from 1.
  question: {
    options: ReadonlyArray<string>
    pick: number | null
    answer: {
      option: number | null
      text: string | null
      by: string
      at: string
    } | null
  } | null
  // A superseded Decision that was never accepted.
  unchosen: boolean
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

// The card of a Part. A Part that a link joins shows its home Concept, and
// a reference shows its Project in that place. The minimal card is the one
// of a record id, whose link is the tab stop.
function PartCard({
  part,
  link = false,
  project,
  minimal = false,
  onOpen,
  action,
}: {
  part: RecordPartSummary
  link?: boolean
  project?: string
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
      concept={project ?? (link ? part.concept : undefined)}
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

// The steps of a Flow in their order, and the fields of an Entity: each a
// name above its meaning. A step shows the id and the title of its Entity
// as a link. An Entity that is gone leaves its id as text. `Title` is the
// heading of each list.
function Lists({
  steps,
  fields,
  parts,
  Title,
  onOpen,
}: {
  steps: ReadonlyArray<RecordStep>
  fields: ReadonlyArray<RecordField>
  parts: ReadonlyArray<RecordPartSummary>
  Title: 'h2' | 'h4'
  onOpen?: OpenHandler
}) {
  const stepsId = useId()
  const fieldsId = useId()

  return (
    <>
      {steps.length > 0 && (
        <section aria-labelledby={stepsId} className={styles.group}>
          <Title id={stepsId} className={styles.groupTitle}>
            Steps
          </Title>
          <ol className={styles.steps}>
            {steps.map(({ text, entity }, index) => {
              const part = parts.find(({ id }) => id === entity)
              return (
                <li key={`${index} ${text}`}>
                  {text}
                  {entity && ' '}
                  {part ? (
                    <RecordLink part={part} onOpen={onOpen}>
                      {part.id} {part.title}
                    </RecordLink>
                  ) : (
                    entity
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      )}
      {fields.length > 0 && (
        <section aria-labelledby={fieldsId} className={styles.group}>
          <Title id={fieldsId} className={styles.groupTitle}>
            Fields
          </Title>
          <dl className={styles.entityFields}>
            {fields.map(({ name, meaning }, index) => (
              // A field has no id of its own: the place is the key.
              <div key={`${index} ${name}`} className={styles.field}>
                <dt>{name}</dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </>
  )
}

// An old Version of the Part, in the activity list: its number, the day of
// its sign-off, and its frozen title, body, steps and fields. It is
// read-only.
function FrozenVersion({
  version,
  at,
  parts,
  onOpen,
}: {
  version: RecordVersion
  // The time of the sign-off, as ISO.
  at: string
  parts: ReadonlyArray<RecordPartSummary>
  onOpen?: OpenHandler
}) {
  const fields = [
    ['Owner', version.owner],
    ['Date', version.date],
    ['Metric', version.metric],
    ['Enforced by', version.enforcedBy],
    [
      'Evidence level',
      version.evidenceLevel && evidenceLevels[version.evidenceLevel],
    ],
    ['Source', version.source],
  ].filter(([, value]) => value != null)

  return (
    <section
      aria-label={`Version ${version.version}`}
      className={styles.version}
    >
      <div className={styles.state}>
        <span>Version {version.version}</span>
        <time dateTime={at}>{at.slice(0, DAY_LENGTH)}</time>
      </div>
      <h3 className={styles.versionTitle}>{version.title}</h3>
      {version.body.trim() !== '' && (
        <Body body={version.body} parts={parts} onOpen={onOpen} />
      )}
      <Lists
        steps={version.steps}
        fields={version.fields}
        parts={parts}
        Title="h4"
        onOpen={onOpen}
      />
      {fields.length > 0 && (
        <dl className={styles.fields}>
          {fields.map(([label, value]) => (
            <div key={label} className={styles.field}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
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
    project?: string
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
          {ends.map(({ part, jointId, link, project }) => (
            <li key={jointId ?? part.id}>
              <PartCard
                part={part}
                link={link}
                project={project}
                // `onOpen` opens a record of this Project. A reference
                // opens with its address.
                onOpen={project === undefined ? onOpen : undefined}
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

// One action on the record: an action of its box Next.
export type RecordAction = NextAction

export type RecordProps = {
  part: RecordPart
  // The common flow that the Part is in, with its current step.
  flow?: StepBarProps
  // The Parts whose record ids the body names.
  bodyParts?: ReadonlyArray<RecordPartSummary>
  pinned: boolean
  onPinChange: (pinned: boolean) => void
  // The control of a person who can watch the Part: the count of the
  // watchers, and if the person is one of them.
  watch?: {
    watching: boolean
    count: number
    onChange: (watching: boolean) => void
  }
  // Opens the record of a card or of a record id in the body.
  onOpen?: OpenHandler
  // The first action is the button. The others are in its menu.
  actions?: ReadonlyArray<RecordAction>
  // false: no step is left. The box Next has no button, and each action is
  // in the menu.
  hasStep?: boolean
  // The question of the open Ask that the Part waits on.
  askQuestion?: string
  // The words of the action that runs. They take the place of the button.
  pending?: string
  // Why the last action failed.
  error?: string
  // With it the box Next takes an answer in words, above the button.
  words?: { value: string; onChange: (value: string) => void }
  // With it the box Next shows the options of the question as one choice.
  // `value` counts the options from 1.
  choice?: { value: number | null; onChange: (option: number) => void }
  onEdit?: () => void
  // The Parts that a new Joint or the pick of an action can go to.
  jointParts?: ReadonlyArray<RecordPartSummary>
  // Adds a Joint from this Part to the Part of the record id.
  onAddJoint?: (recordId: string) => void
  // The words of the Joint that saves. They take the place of its field.
  jointPending?: string
  // Why the last Joint was not added.
  jointFailure?: string
  onRemoveJoint?: (jointId: number) => void
  // Answers the flag of a new Contract Version: the Joint to the needed
  // Part of the record id moves to that Version.
  onMoveToVersion?: (recordId: string, version: number) => void
  // What the tools outside Glue have on the Part. It comes before the
  // activity.
  children?: ReactNode
  // The Responsible and the Co-Authors of the Part.
  assignees?: ReactNode
  // The home Concept of the Part as a choice of the Concepts of the Project:
  // a pick moves the Part there. `value` is a slug.
  home?: {
    value: string
    concepts: ReadonlyArray<{ slug: string; title: string }>
    onChange: (slug: string) => void
  }
}

// One Part in the main window: the head, the step bar of its flow, the box
// Next with the one button, the empty slots and the open flags, the Parts
// under review that it needs, the body, the type fields that
// have a value, the Parts it is glued to as groups of cards, and what
// happened to it.
export function Record({
  part,
  flow,
  bodyParts = [],
  pinned,
  onPinChange,
  watch,
  onOpen,
  actions = [],
  hasStep,
  askQuestion,
  pending,
  error,
  words,
  choice,
  onEdit,
  jointParts = [],
  onAddJoint,
  jointPending,
  jointFailure,
  onRemoveJoint,
  onMoveToVersion,
  children,
  assignees,
  home,
}: RecordProps) {
  const titleId = useId()
  const homeId = useId()
  const signalsId = useId()
  const searchId = useId()
  const questionId = useId()
  const activityId = useId()
  // The old Version that is open: the record id and the number.
  const [openVersion, setOpenVersion] = useState<string>()
  // A Part has one Joint to another Part at most, and none to itself. A
  // reference holds a Part of another Project, which can have the same id.
  const joined = new Set([
    part.id,
    ...[...part.needs, ...part.neededBy]
      .filter((end) => end.project === undefined)
      .map((end) => end.part.id),
  ])
  const { word, Glyph, className } = signs[part.trust]
  const { measure, issueUrl, question } = part
  const { emptySlots = [], reviewNotes = [] } = part
  // A Decision on a Hunch takes no sign-off: the reason stands with the
  // other things that the Part needs.
  const restsOnHunch = part.evidenceBase === 'hunch'
  const given = question?.answer
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
    ['Question', askQuestion],
  ]
  const shownFields = fields.filter(([, value]) => value != null)

  return (
    <article aria-labelledby={titleId} className={styles.record}>
      <header className={styles.head}>
        <div className={styles.signs}>
          <Glyph className={className} />
          <span>{part.unchosen ? 'Not chosen' : word}</span>
          <span>{partTypes[part.type]}</span>
          <span>{part.id}</span>
          <div className={styles.controls}>
            {watch && (
              <Button
                kind="ghost"
                size="sm"
                renderIcon={watch.watching ? ViewFilled : View}
                iconDescription="Watch"
                aria-label={`Watch ${watch.count}`}
                aria-pressed={watch.watching}
                onClick={() => watch.onChange(!watch.watching)}
              >
                {watch.count}
              </Button>
            )}
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
            {part.evidenceBase === 'pattern' && <span>Rests on a Pattern</span>}
          </div>
        )}
      </header>
      {(home || assignees) && (
        <div className={styles.holders}>
          {home && (
            <div className={styles.home}>
              <Select
                id={homeId}
                size="sm"
                labelText="Concept"
                value={home.value}
                onChange={({ target }) => home.onChange(target.value)}
              >
                {home.concepts.map(({ slug, title }) => (
                  <SelectItem key={slug} value={slug} text={title} />
                ))}
              </Select>
            </div>
          )}
          {assignees}
        </div>
      )}
      {flow && <StepBar {...flow} />}
      <NextBox
        actions={actions}
        hasStep={hasStep}
        pending={pending}
        error={error}
        words={words}
        choice={
          choice && question
            ? { ...choice, options: question.options }
            : undefined
        }
        pickParts={jointParts.filter(({ id }) => id !== part.id)}
      />
      {(emptySlots.length > 0 || restsOnHunch || part.flags.length > 0) && (
        <ul aria-label="Flags" className={styles.flags}>
          {emptySlots.map((slot) => (
            <li key={slot} className={styles.flag}>
              <span className={styles.reason}>{slotReasons[slot]}</span>
            </li>
          ))}
          {restsOnHunch && (
            <li className={styles.flag}>
              <span className={styles.reason}>Rests on a Hunch</span>
            </li>
          )}
          {part.flags.map(({ reason, part: cause, contract }) => (
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
              {contract && (
                <dl className={styles.changes}>
                  {[
                    {
                      label: 'Version',
                      before: contract.builtWith,
                      after: contract.newest,
                    },
                    ...contract.changes.map(({ field, before, after }) => ({
                      label: frozenFields[field],
                      before,
                      after,
                    })),
                  ].map(({ label, before, after }) => (
                    <div key={label} className={styles.change}>
                      <dt>{label}</dt>
                      <dd>
                        {before !== null && <del>{before}</del>}
                        {after !== null && <ins>{after}</ins>}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {contract && onMoveToVersion && (
                <Button
                  kind="tertiary"
                  size="sm"
                  className={styles.move}
                  onClick={() => onMoveToVersion(cause.id, contract.newest)}
                >
                  Move to Version {contract.newest}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Group
        title={workStates.review}
        ends={partEnds(reviewNotes)}
        onOpen={onOpen}
      />
      {question && !choice && (
        <section aria-labelledby={questionId} className={styles.group}>
          <h2 id={questionId} className={styles.groupTitle}>
            {given ? 'Answer' : 'Options'}
          </h2>
          <ol className={styles.options}>
            {question.options.map((option, index) => {
              const chosen = given?.option === index + 1
              return (
                <li
                  key={option}
                  aria-current={chosen || undefined}
                  className={chosen ? styles.chosen : undefined}
                >
                  {option}
                </li>
              )
            })}
            {given?.text != null && (
              <li aria-current className={styles.chosen}>
                {given.text}
              </li>
            )}
          </ol>
          {given && (
            <div className={styles.state}>
              <span>{given.by}</span>
              <time dateTime={given.at}>{given.at.slice(0, DAY_LENGTH)}</time>
            </div>
          )}
        </section>
      )}
      {part.body.trim() !== '' && (
        <Body body={part.body} parts={bodyParts} onOpen={onOpen} />
      )}
      <Lists
        steps={part.steps}
        fields={part.fields}
        parts={bodyParts}
        Title="h2"
        onOpen={onOpen}
      />
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
        title="Metrics"
        ends={partEnds(part.goalMetrics ?? [])}
        onOpen={onOpen}
      />
      <Group
        title="Needs"
        ends={part.needs}
        onOpen={onOpen}
        onRemoveJoint={onRemoveJoint}
      >
        {onAddJoint && (
          <div className={styles.search}>
            {jointPending === undefined ? (
              <PartSearch
                id={searchId}
                label="Add Joint"
                parts={jointParts.filter(({ id }) => !joined.has(id))}
                invalidText={jointFailure}
                onPick={onAddJoint}
              />
            ) : (
              <InlineLoading description={jointPending} />
            )}
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
            {part.activity.map(({ kind, at, by, note, flag, version }) => {
              const versionKey = `${part.id} ${version?.version}`
              const isOpen = openVersion === versionKey
              return (
                <li key={`${at} ${kind} ${flag?.part.id}`}>
                  <time dateTime={at}>{at.slice(0, DAY_LENGTH)}</time>
                  <span>{activityKinds[kind]}</span>
                  {by && <span>{by}</span>}
                  {note &&
                    (WEB_LINK.test(note) ? (
                      <Link href={note}>{note}</Link>
                    ) : (
                      <span>{note}</span>
                    ))}
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
                  {version && (
                    <Button
                      kind="ghost"
                      size="sm"
                      className={styles.versionButton}
                      renderIcon={isOpen ? ChevronUp : ChevronDown}
                      aria-expanded={isOpen}
                      onClick={() =>
                        setOpenVersion(isOpen ? undefined : versionKey)
                      }
                    >
                      Version {version.version}
                    </Button>
                  )}
                  {version && isOpen && (
                    <FrozenVersion
                      version={version}
                      at={at}
                      parts={bodyParts}
                      onOpen={onOpen}
                    />
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </article>
  )
}
