import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type {
  DecisionStatus,
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

export const answers = [
  'fine',
  'wait',
  'need-time',
  'not-ready',
  'supersede',
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
// sign-off: it publishes a draft and a Part in review.
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
    decisionStatus: 'proposed',
    insightStatus: 'draft',
  },
  supersede: {
    from: ['draft', 'review'],
    ...published,
    closesFlags: true,
    decisionStatus: 'accepted',
    insightStatus: null,
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
export function allowedAnswers(workState: WorkState): Answer[] {
  return answers.filter((answer) =>
    answerRules[answer].from.includes(workState),
  )
}

// What follows a write to a Part, as common table expressions of the same
// statement. `changed` names the expression that gives the Part after the
// write: "id", "title", "body", "trust" and "work_state". "parts" still
// reads as before the write.
//
// - A published Part with a new title or body, and a Part that turns
//   not-ready or wrong, flags each Part that needs it over a Joint. A two-way
//   Joint flags in both directions. A Part that is draft or sunk gets no flag.
// - A Part with a new flag turns flagged and to-check. A Part in review
//   stays there, and red stays red: automatic is yellow only.
// - A Part that waits on the changed Part is back in to-check.
// - `closesFlags` reads `new_part`: the open flags of the Part close when it
//   holds. By default: when the Part is published or sunk.
export function spreadTrust(
  changed: string,
  closesFlags: SQL = sql`new_part."work_state" in ('published', 'sunk')`,
): SQL {
  const newParts = sql.identifier(changed)
  return sql`,
    old_parts as (
      select "id", "title", "body", "trust", "work_state" from "parts"
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
            old_part."work_state" = 'published'
              and (
                new_part."title" <> old_part."title"
                or new_part."body" <> old_part."body"
              )
          ),
          (
            'not-ready',
            new_part."trust" = 'not-ready' and old_part."trust" <> 'not-ready'
          ),
          ('wrong', new_part."trust" = 'wrong' and old_part."trust" <> 'wrong')
      ) as reasons ("reason", "applies")
      where reasons."applies"
    ),
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
      where needing."work_state" not in ('draft', 'sunk')
      on conflict do nothing
      returning "part_id"
    ),
    woken as (
      select waiting."id"
      from "parts" as waiting
      join ${newParts} as new_part on new_part."id" = waiting."awaited_part_id"
      join old_parts as old_part on old_part."id" = new_part."id"
      where waiting."work_state" = 'waiting'
        and (
          new_part."title", new_part."body",
          new_part."trust", new_part."work_state"
        ) is distinct from (
          old_part."title", old_part."body",
          old_part."trust", old_part."work_state"
        )
    ),
    flagged as (
      update "parts" set
        "trust" = case when "trust" = 'solid' then 'flagged' else "trust" end,
        "work_state" = case
          when "work_state" = 'review' then 'review'
          else 'to-check'
        end,
        "awaited_part_id" = null,
        "changed_at" = now()
      where "id" in (
          select "part_id" from added_flags union select "id" from woken
        )
        and "id" not in (select "id" from ${newParts})
    )`
}
