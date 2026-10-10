import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import { evidenceTypes } from '../part-fields.ts'
import { selectOwnerOf } from './members.ts'
import type {
  DecisionStatus,
  EvidenceLevel,
  FlagReason,
  InsightStatus,
  PartType,
  Trust,
  WorkState,
} from './schema.ts'
import { workStates } from './schema.ts'

// Trust and the Work state of a Part (D27, D39): how they follow the status,
// what each answer does, and how a change travels one step along the Joints.

export type TrustState = { trust: Trust; workState: WorkState }

// A new Part is a draft that nobody relies on.
export const NEW_PART_STATE: TrustState = {
  trust: 'not-ready',
  workState: 'draft',
}

const published: TrustState = { trust: 'solid', workState: 'published' }

const decisionStates: Record<string, TrustState> = {
  proposed: { trust: 'not-ready', workState: 'review' },
  accepted: published,
  superseded: { trust: 'wrong', workState: 'sunk' },
}

// The Trust and the Work state that go with the status of a Decision or of
// an Insight. undefined: the status of this type does not move them.
export function stateOfStatus(
  type: PartType,
  status: string | null,
): TrustState | undefined {
  if (type === 'decision') return decisionStates[status ?? '']
  if (type === 'insight') return status === 'draft' ? NEW_PART_STATE : published
  return undefined
}

// The usual answer of a Work state comes first: `fine` on a flag, and the
// sign-off `supersede` on a draft and on a Part in review. `ready` comes
// after it: the owner of a draft can still sign off at once (glue/D55).
export const answers = [
  'fine',
  'supersede',
  'ready',
  'wait',
  'need-time',
  'not-ready',
  'sink',
] as const
export type Answer = (typeof answers)[number]

type AnswerRule = {
  // The Work states that take the answer.
  from: readonly WorkState[]
  // No Trust: the answer keeps it.
  trust?: Trust
  workState: WorkState
  closesFlags: boolean
  // The status that goes with the new state. undefined: the status stays.
  decisionStatus?: DecisionStatus
  insightStatus?: InsightStatus | null
}

const notSunk = workStates.filter((workState) => workState !== 'sunk')

// The table of the answers in docs/concept.md, section 6. The state diagram
// there has no arrow for "Mark not ready" and none out of Draft to
// Published. Red and black are the choice of the owner at any time, so each
// Part that is not sunk takes `not-ready` and `sink`. `supersede` is the
// sign-off: it publishes a draft and a Part in review. `not-ready` keeps the
// status of a Decision: "proposed" is review, and the answer makes a draft.
// `ready` takes a draft of each type to review and keeps its Trust: the
// Parts that need it show a note. A Decision in review is "proposed".
export const answerRules: Record<Answer, AnswerRule> = {
  fine: {
    from: ['to-check'],
    ...published,
    closesFlags: true,
    decisionStatus: 'accepted',
    insightStatus: null,
  },
  wait: { from: ['to-check'], workState: 'waiting', closesFlags: false },
  'need-time': { from: ['to-check'], workState: 'draft', closesFlags: true },
  'not-ready': {
    from: notSunk,
    ...NEW_PART_STATE,
    closesFlags: true,
    insightStatus: 'draft',
  },
  supersede: {
    from: ['draft', 'review'],
    ...published,
    closesFlags: true,
    decisionStatus: 'accepted',
    insightStatus: null,
  },
  ready: {
    from: ['draft'],
    workState: 'review',
    closesFlags: false,
    decisionStatus: 'proposed',
  },
  sink: {
    from: notSunk,
    trust: 'wrong',
    workState: 'sunk',
    closesFlags: true,
    decisionStatus: 'superseded',
    insightStatus: null,
  },
}

// The answers that a Part in the Work state takes.
export function listAnswers(workState: WorkState): Answer[] {
  return answers.filter((answer) =>
    answerRules[answer].from.includes(workState),
  )
}

// A step of the evidence level of an Insight that a member takes
// (glue/D60), with its note: the second source that agrees, what was
// tested, or why the Insight is in doubt. A Hunch whose Signals agree is
// raised with no note.
export type LevelStep = {
  kind: 'raised' | 'verified' | 'disputed'
  note: string | null
}

// The value of "published_at" for a write that gives the Part the Work state:
// the first time that it is published stays.
export function toPublishedAt(workState: WorkState): SQL {
  return workState === 'published'
    ? sql`coalesce("published_at", now())`
    : sql`"published_at"`
}

// What follows a write to a Part, as common table expressions of the same
// statement. `changed` names the expression that gives the Part after the
// write, with the columns of `historyFields`. "parts" still reads as before
// the write.
//
// - A published Part with a new title or body, new steps or new fields
//   ("new text" below), and a Part that turns
//   not-ready or wrong, flags each Part that needs it over a Joint. A Part
//   that goes to review flags nobody: the Parts that need it show a note,
//   see selectReviewNotes. A two-way
//   Joint flags in both directions. A Part that is draft or sunk gets no flag.
//   Trust does not travel along a reference: a Part of another Project gets
//   no flag (D45).
// - A draft or a Part in review that is published again flags them with
//   `changed`: its edits reached nobody. The first sign-off flags nobody.
// - A Part with a flag from the write turns flagged and to-check. A Part in
//   review stays there, and red stays red: automatic is yellow only. A cause
//   that has an open flag on the Part flags it again. So an open flag that a
//   write at the same time left on a published Part mutes nothing.
// - A Part that waits on the changed Part is back in to-check.
// - A Part that waits on a Part that is published again as its last Version
//   says gets no flag, and its `not-ready` flag of that Part closes: see
//   releaseWaiting. Another open flag of that Part stays: nobody checked it.
// - `closesFlags` reads `new_part`: the open flags of the Part close when it
//   holds. By default: when the Part is published or sunk.
// - `isOffTarget`: the write is a reading that misses the target of the Part.
//   It flags each Part that needs it.
// - `sameMeaning`: the write is a wording fix (D53). A new title or body
//   flags nobody, and wakes no Part that waits. A new Trust or Work state in
//   the same write still does.
// - `member`: the row id of the member who writes, as SQL. The Version and
//   the activity line of the Part keep it.
// - `isEdit`: the write is an edit of the Part. It gets an activity line
//   also when the text and the Work state stay.
// - `owner`: the name of the owner that the same write gives the Part. A
//   Version of the write freezes it: see selectVersionFields.
// - `step`: the write is a step of the evidence level (glue/D60). Its
//   activity line has the kind and the note of the step. A dispute flags
//   each Part that needs the Insight, as a new text does.
//
// The same statement keeps the history of the Part (glue/D55):
// - A sign-off, from draft or review to published, adds a Part Version: the
//   frozen title, body and fields.
// - Each step of the Work state and each edit adds an activity line. A Part
//   that the write turns to-check gets a line with no member.
export function spreadTrust(
  changed: string,
  {
    closesFlags = sql`new_part."work_state" in ('published', 'sunk')`,
    isOffTarget = false,
    sameMeaning = false,
    member = sql`null::integer`,
    isEdit = false,
    step,
    owner,
  }: {
    closesFlags?: SQL
    isOffTarget?: boolean
    sameMeaning?: boolean
    member?: SQL
    isEdit?: boolean
    step?: LevelStep
    owner?: SQL
  } = {},
): SQL {
  const newParts = sql.identifier(changed)
  const isNewText = sql`(
    new_part."title" <> old_part."title"
    or new_part."body" <> old_part."body"
    or new_part."steps" <> old_part."steps"
    or new_part."fields" <> old_part."fields"
  )`
  const hasNewText = sameMeaning ? sql`false` : isNewText
  return sql`,
    old_parts as (
      select
        "id", "title", "body", "steps", "fields", "trust", "work_state",
        "published_at"
      from "parts"
      where "id" in (select "id" from ${newParts})
    ),
    closed_flags as (
      update "flags" set "closed_at" = now()
      where "closed_at" is null
        and "part_id" in (
          select new_part."id" from ${newParts} as new_part
          where ${closesFlags}
        )
    ),
    causes as (
      select new_part."id", reasons."reason"
      from ${newParts} as new_part
      join old_parts as old_part on old_part."id" = new_part."id"
      cross join lateral (
        values
          (
            'changed',
            (
              old_part."work_state" = 'published'
              and ${hasNewText}
            )
            or (
              new_part."work_state" = 'published'
              and old_part."work_state" in ('draft', 'review')
              and old_part."published_at" is not null
            )
            or ${step?.kind === 'disputed'}::boolean
          ),
          (
            'not-ready',
            new_part."trust" = 'not-ready'
            and old_part."trust" <> 'not-ready'
            and new_part."work_state" <> 'review'
          ),
          ('wrong', new_part."trust" = 'wrong' and old_part."trust" <> 'wrong'),
          ('off-target', ${isOffTarget}::boolean)
      ) as reasons ("reason", "applies")
      where reasons."applies"
    ),
    ${releaseWaiting(
      sql`
      select waiting."id" as "part_id", new_part."id" as "cause_part_id"
      from "parts" as waiting
      join ${newParts} as new_part on new_part."id" = waiting."awaited_part_id"
      join old_parts as old_part on old_part."id" = new_part."id"
      join "part_versions" as last_version
        on last_version."part_id" = new_part."id"
        and last_version."version" = ${selectNextVersion(sql`new_part."id"`)} - 1
      where new_part."work_state" = 'published'
        and old_part."work_state" in ('draft', 'review')
        and last_version."title" = new_part."title"
        and last_version."body" = new_part."body"
        and coalesce(last_version."fields" -> 'steps', '[]'::jsonb)
          = new_part."steps"
        and coalesce(last_version."fields" -> 'fields', '[]'::jsonb)
          = new_part."fields"
        and waiting."id" not in (select "id" from ${newParts})
    `,
      'not-ready',
    )},
    added_flags as (
      insert into "flags" ("part_id", "cause_part_id", "reason")
      select distinct needing."id", causes."id", causes."reason"
      from causes
      join "joints" as joint
        on joint."needed_part_id" = causes."id"
        or (joint."two_way" and joint."part_id" = causes."id")
      join "parts" as needing
        on needing."id" = case
          when joint."needed_part_id" = causes."id" then joint."part_id"
          else joint."needed_part_id"
        end
      join "parts" as cause on cause."id" = causes."id"
      where needing."work_state" not in ('draft', 'sunk')
        and needing."project_id" = cause."project_id"
        and needing."id" not in (select "id" from dropped)
      on conflict ("part_id", "cause_part_id", "reason")
        where "closed_at" is null
        do update set "created_at" = now()
      returning "part_id"
    ),
    woken as (
      select waiting."id"
      from "parts" as waiting
      join ${newParts} as new_part on new_part."id" = waiting."awaited_part_id"
      join old_parts as old_part on old_part."id" = new_part."id"
      where waiting."work_state" = 'waiting'
        and waiting."id" not in (select "id" from dropped)
        and (
          ${hasNewText}
          or new_part."trust" <> old_part."trust"
          or new_part."work_state" <> old_part."work_state"
        )
    ),
    flagged as (
      ${flagParts(sql`select "part_id" from added_flags union select "id" from woken`)}
        and "id" not in (select "id" from ${newParts})
    ),
    signed_versions as (
      insert into "part_versions" (
        "part_id", "version", "title", "body", "fields", "member_id"
      )
      select
        new_part."id",
        ${selectNextVersion(sql`new_part."id"`)},
        new_part."title",
        new_part."body",
        ${selectVersionFields(sql`new_part`, owner)},
        ${member}
      from ${newParts} as new_part
      join old_parts as old_part on old_part."id" = new_part."id"
      where new_part."work_state" = 'published'
        and old_part."work_state" in ('draft', 'review')
      returning "part_id", "version"
    ),
    logged_activity as (
      insert into "part_activity" (
        "part_id", "kind", "version", "member_id", "note"
      )
      select
        new_part."id",
        step."kind",
        (
          select "version" from signed_versions
          where "part_id" = new_part."id"
        ),
        ${member},
        ${step?.note ?? null}::text
      from ${newParts} as new_part
      join old_parts as old_part on old_part."id" = new_part."id"
      cross join lateral (
        select case
          when ${step?.kind ?? null}::text is not null
            then ${step?.kind ?? null}::text
          when new_part."work_state" <> old_part."work_state"
            then new_part."work_state"
          when ${isNewText} and ${sameMeaning}::boolean then 'wording'
          when ${isNewText} or ${isEdit}::boolean then 'changed'
        end as "kind"
      ) as step
      where step."kind" is not null
      union all
      select "id", 'to-check', null, null, null
      from "parts"
      where "id" in (
          select "part_id" from added_flags union select "id" from woken
        )
        and "id" not in (select "id" from ${newParts})
        and "work_state" not in ('to-check', 'review')
    )`
}

// The fields of a Part that a write gives to spreadTrust: what it compares,
// and what a Part Version freezes.
export const historyFields = sql`
  "id", "title", "body", "trust", "work_state", "status", "owner", "date",
  "source", "metric", "enforced_by", "evidence_level", "steps", "fields"`

// The number of the next Version of the Part: the numbers count up per Part.
export function selectNextVersion(partId: SQL): SQL {
  return sql`(
    select coalesce(max("version"), 0) + 1
    from "part_versions" where "part_id" = ${partId}
  )`
}

// The fields that a Part Version freezes next to the title and the body.
// `part` names a row with the history fields. The owner is the one that the
// page of the Part shows: the name of its Responsible (glue-build/D58).
// `owner` is the name that the same statement gives the Part: the statement
// does not read its own write of the Responsible.
export function selectVersionFields(
  part: SQL,
  owner: SQL = selectOwnerOf(part),
): SQL {
  return sql`jsonb_build_object(
    'status', ${part}."status",
    'owner', ${owner},
    'date', ${part}."date",
    'source', ${part}."source",
    'metric', ${part}."metric",
    'enforcedBy', ${part}."enforced_by",
    'evidenceLevel', ${part}."evidence_level",
    'steps', ${part}."steps",
    'fields', ${part}."fields"
  )`
}

// What a Part type needs and can miss (D52): a Goal, evidence or a Decision.
export const slots = ['goal', 'evidence', 'decision'] as const
export type Slot = (typeof slots)[number]

// The Part types that fill a slot.
const slotTypes: Record<Slot, ReadonlyArray<PartType>> = {
  goal: ['goal'],
  evidence: evidenceTypes,
  decision: ['decision'],
}

// The slots of a Part type, in the order that a Part lists them. A Part with
// no Joint to a Part that fills a slot has an empty slot.
export const neededSlots: Partial<Record<PartType, ReadonlyArray<Slot>>> = {
  decision: ['goal', 'evidence'],
  flow: ['decision'],
  entity: ['decision'],
}

// The reason that an empty slot gives.
export const slotReasons: Record<Slot, string> = {
  goal: 'needs a Goal',
  evidence: 'needs evidence',
  decision: 'needs a Decision',
}

const slotRules = sql.join(
  Object.entries(neededSlots).flatMap(([type, needed]) =>
    needed.map((slot, position) => {
      const fillers = sql.join(
        slotTypes[slot].map((filler) => sql`${filler}`),
        sql`, `,
      )
      return sql`(${type}::text, ${slot}::text, ${position}::integer, array[${fillers}]::text[])`
    }),
  ),
  sql`, `,
)

// The `parts` table, or an alias of it, in a select with a join: the
// columns of a select of one table have no table name, and the statements
// here read them from inside a subquery.
type PartsTable = Record<
  'id' | 'projectId' | 'type' | 'trust' | 'workState',
  AnyPgColumn
>

// The Joints of the Part with the Part at their other end, as the `from` of
// a subquery. A two-way Joint counts from both sides.
function fromNeeded(part: PartsTable): SQL {
  return sql`
    "joints" as joint
    join "parts" as needed on needed."id" = case
      when joint."part_id" = ${part.id} then joint."needed_part_id"
      else joint."part_id"
    end
    where (
      joint."part_id" = ${part.id}
      or (joint."two_way" and joint."needed_part_id" = ${part.id})
    )`
}

// The empty slots of a Part. They are read from the Joints, never stored: no
// flag, no notice and no step along a Joint. A sunk Part has none.
export function selectEmptySlots(part: PartsTable): SQL<Slot[]> {
  return sql<Slot[]>`(
    select coalesce(jsonb_agg(rule."slot" order by rule."position"), '[]'::jsonb)
    from (values ${slotRules}) as rule ("type", "slot", "position", "fillers")
    where rule."type" = ${part.type}
      and ${part.workState} <> 'sunk'
      and not exists (
        select 1 from ${fromNeeded(part)}
          and needed."type" = any(rule."fillers")
      )
  )`
}

// What the evidence of a Decision is worth (glue/D60): the level of its
// strongest piece. A Guardrail counts as Confirmed. null: the Part is no
// Decision, or it has no evidence.
export function selectEvidenceBase(
  part: PartsTable,
): SQL<EvidenceLevel | null> {
  return sql<EvidenceLevel | null>`case when ${part.type} = 'decision' then (
    select case
      when bool_or(
        needed."type" = 'guardrail' or needed."evidence_level" = 'confirmed'
      ) then 'confirmed'
      when bool_or(needed."evidence_level" = 'pattern') then 'pattern'
      when count(*) > 0 then 'hunch'
    end
    from ${fromNeeded(part)}
      and needed."type" in ${evidenceTypes}
  ) end`
}

// The Trust of a Part as a reader sees it: the one place that says it. A
// solid Part with an empty slot is unsure, so it reads as flagged. Red stays
// red: automatic is yellow only.
export function selectTrust(part: PartsTable): SQL<Trust> {
  return sql<Trust>`case
    when ${part.trust} = 'solid'
      and jsonb_array_length(${selectEmptySlots(part)}) > 0
    then 'flagged'
    else ${part.trust}
  end`
}

// A Part in review that another Part needs (D52).
export type ReviewNote = { id: string; type: PartType; title: string }

// The notes of a Part: the Parts in review that it needs, in the order of
// the Joints. They are read from the Joints and the Work state, never
// stored: no flag and no notice. The note is gone when the Part leaves
// review. A sunk Part has none, and a reference gives none (D45).
export function selectReviewNotes(part: PartsTable): SQL<ReviewNote[]> {
  return sql<ReviewNote[]>`(
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', needed."record_id",
          'type', needed."type",
          'title', needed."title"
        )
        order by joint."id"
      ),
      '[]'::jsonb
    )
    from ${fromNeeded(part)}
      and needed."work_state" = 'review'
      and needed."project_id" = ${part.projectId}
      and ${part.workState} <> 'sunk'
  )`
}

// What gives a waiting Part its Version back (glue/D65), as common table
// expressions. `pairs` is a select of "part_id" and "cause_part_id": the
// cause is dropped for the Part, so nothing changed for it. A Part of a pair
// that waits on its cause is published and solid again, and its flags of
// the cause close. `reason`: only the flags of the cause with this reason
// close. A Part with another open flag is back in to-check. "parts" and
// "flags" read as before the write. `dropped` has the ids of these Parts.
export function releaseWaiting(pairs: SQL, reason?: FlagReason): SQL {
  const isDropped = (causePartId: SQL) => sql`(
    "flags"."cause_part_id" = ${causePartId}
    ${reason === undefined ? sql`` : sql`and "flags"."reason" = ${reason}::text`}
  )`
  return sql`
    dropped as (
      select
        waiting."id",
        waiting."awaited_part_id" as "cause_part_id",
        exists (
          select 1 from "flags"
          where "flags"."part_id" = waiting."id"
            and "flags"."closed_at" is null
            and not ${isDropped(sql`waiting."awaited_part_id"`)}
        ) as "has_other_flag"
      from "parts" as waiting
      join (${pairs}) as pair
        on pair."part_id" = waiting."id"
        and pair."cause_part_id" = waiting."awaited_part_id"
      where waiting."work_state" = 'waiting'
    ),
    released as (
      update "parts" set
        "trust" = case
          when "trust" = 'flagged' and not dropped."has_other_flag" then 'solid'
          else "trust"
        end,
        "work_state" = case
          when dropped."has_other_flag" then 'to-check'
          else 'published'
        end,
        "awaited_part_id" = null,
        "changed_at" = now()
      from dropped
      where "parts"."id" = dropped."id"
      returning "parts"."id", "parts"."work_state"
    ),
    released_flags as (
      update "flags" set "closed_at" = now()
      from dropped
      where "flags"."closed_at" is null
        and "flags"."part_id" = dropped."id"
        and ${isDropped(sql`dropped."cause_part_id"`)}
    ),
    released_activity as (
      insert into "part_activity" ("part_id", "kind")
      select "id", "work_state" from released
    )`
}

// The write that turns the Parts of the ids flagged and to-check. A Part in
// review stays there, and red stays red: automatic is yellow only.
export function flagParts(partIds: SQL): SQL {
  return sql`
    update "parts" set
      "trust" = case when "trust" = 'solid' then 'flagged' else "trust" end,
      "work_state" = case
        when "work_state" = 'review' then 'review'
        else 'to-check'
      end,
      "awaited_part_id" = null,
      "changed_at" = now()
    where "id" in (${partIds})`
}
