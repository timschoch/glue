import { and, eq, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { getProjectId } from './projects.ts'
import { InvalidRecordError } from './record-errors.ts'
import { parseInput, slug as slugSchema, text } from './record-input.ts'
import * as schema from './schema.ts'
import type { PartType } from './schema.ts'

// The Kinds of a Project (glue/D57). A Kind lists the slots that a Concept
// of it fills: one slot per Part type, required or not, with the least
// count of Parts. A member adds a Kind and changes its slots.

// Tier 1 is what a coding agent reads. Tier 2 is the why.
export const tier1Types = [
  'flow',
  'entity',
  'guardrail',
] as const satisfies PartType[]
export const tier2Types = [
  'insight',
  'goal',
  'decision',
  'metric',
] as const satisfies PartType[]

// The order of the slots of a Kind: the why first.
const slotOrder: readonly PartType[] = [...tier2Types, ...tier1Types]

export function sortSlots<TSlot extends { type: PartType }>(
  slots: TSlot[],
): TSlot[] {
  return slotOrder.flatMap((type) => slots.filter((slot) => slot.type === type))
}

export type KindSlot = {
  type: PartType
  required: boolean
  tier: 1 | 2
  // The least count of Parts that fill the slot.
  minCount: number
}

export type Kind = { slug: string; name: string; slots: KindSlot[] }

const slotsSchema = z
  .array(
    z.strictObject({
      type: z.enum(schema.partTypes),
      required: z.boolean().default(true).meta({
        description: 'A sign-off needs the slot filled. Default: true',
      }),
      minCount: z.int().min(1).default(1).meta({
        description: 'The least count of Parts that fill the slot. Default: 1',
      }),
    }),
  )
  .check(({ value, issues }) => {
    const twice = value.find(
      ({ type }, index) =>
        value.findIndex((slot) => slot.type === type) < index,
    )
    if (twice)
      issues.push({
        code: 'custom',
        input: value,
        message: `a Kind has one slot per Part type: ${twice.type}`,
      })
  })

export const newKindSchema = z.strictObject({
  slug: slugSchema,
  name: text,
  slots: slotsSchema,
})

export type NewKind = z.input<typeof newKindSchema>

export const kindChangeSchema = z.strictObject({
  name: text.optional(),
  slots: slotsSchema.optional().meta({
    description: 'The slots that the Kind has from now on, in place of its old',
  }),
})

export type KindChange = z.input<typeof kindChangeSchema>

// The Kind that each Project starts with. A Brief needs the why (Insight,
// Goal, Decision, Metric) and what a coding agent reads (Flow, Entity,
// Guardrail). Migration 0027 wrote the same Kind for the Projects of then.
export const briefKind: NewKind = {
  slug: 'brief',
  name: 'Brief',
  slots: slotOrder.map((type) => ({ type })),
}

const { kinds, kindSlots } = schema

// The slots as rows, for `jsonb_to_recordset`. The Part type gives the tier.
function selectSlotRows(slots: z.output<typeof slotsSchema>) {
  const rows = slots.map(({ type, required, minCount }) => ({
    type,
    required,
    tier: tier1Types.some((tier1) => tier1 === type) ? 1 : 2,
    min_count: minCount,
  }))
  return sql`jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as slot (
    "type" text, "required" boolean, "tier" integer, "min_count" integer
  )`
}

// The common table expressions that add the Kind with its slots to the
// Project of the row id. `kind` has the row id of the new Kind, and no row
// when the Project has a Kind of the slug already.
export function addKindSql(projectId: SQL, kind: NewKind) {
  const { slug, name, slots } = parseInput(newKindSchema, kind)
  return sql`
    kind as (
      insert into "kinds" ("project_id", "slug", "name")
      select ${projectId}, ${slug}::text, ${name}::text
      on conflict ("project_id", "slug") do nothing
      returning "id"
    ),
    kind_slots_added as (
      insert into "kind_slots" (
        "kind_id", "type", "required", "tier", "min_count"
      )
      select kind."id", slot."type", slot."required", slot."tier", slot."min_count"
      from kind
      cross join ${selectSlotRows(slots)}
    )`
}

const idRowsSchema = z.object({ rows: z.array(z.object({ id: z.number() })) })

// The Kinds of the Project, in the order they were added.
export async function listKinds(
  db: ConceptDb,
  projectSlug: string,
): Promise<Kind[]> {
  const projectId = await getProjectId(db, projectSlug)
  const rows = await db
    .select({
      id: kinds.id,
      slug: kinds.slug,
      name: kinds.name,
      slot: {
        type: kindSlots.type,
        required: kindSlots.required,
        tier: kindSlots.tier,
        minCount: kindSlots.minCount,
      },
    })
    .from(kinds)
    .leftJoin(kindSlots, eq(kindSlots.kindId, kinds.id))
    .where(eq(kinds.projectId, projectId))
    .orderBy(kinds.id)

  const found = new Map<number, Kind>()
  for (const { id, slug, name, slot } of rows) {
    const kind = found.get(id) ?? { slug, name, slots: [] }
    if (slot) kind.slots.push(slot)
    found.set(id, kind)
  }
  return [...found.values()].map((kind) => ({
    ...kind,
    slots: sortSlots(kind.slots),
  }))
}

// The row id of the Kind of the slug.
export async function findKindId(
  db: ConceptDb,
  projectId: number,
  slug: string,
): Promise<number> {
  const found = await db
    .select({ id: kinds.id })
    .from(kinds)
    .where(and(eq(kinds.projectId, projectId), eq(kinds.slug, slug)))
  if (found.length === 0)
    throw new InvalidRecordError(`kind "${slug}" not found`)
  return found[0].id
}

// Adds a Kind with its slots to the Project, and gives back its slug.
export async function addKind(
  db: ConceptDb,
  projectSlug: string,
  kind: NewKind,
): Promise<string> {
  const projectId = await getProjectId(db, projectSlug)
  const result = await db.execute(sql`
    with ${addKindSql(sql`${projectId}::integer`, kind)}
    select "id" from kind
  `)
  if (idRowsSchema.parse(result).rows.length === 0)
    throw new InvalidRecordError(`kind "${kind.slug}" exists already`)
  return kind.slug
}

// Gives a Kind a new name, new slots, or both. The new slots take the place
// of the old ones. Each Concept of the Kind has the new slots from then on.
export async function updateKind(
  db: ConceptDb,
  projectSlug: string,
  slug: string,
  change: KindChange,
): Promise<void> {
  const { name, slots } = parseInput(kindChangeSchema, change)
  if (name === undefined && slots === undefined)
    throw new InvalidRecordError('send at least one field')
  const projectId = await getProjectId(db, projectSlug)
  // A slot that stays is updated, so no row is removed and added again in
  // one statement.
  const slotChanges =
    slots === undefined
      ? sql``
      : sql`,
    removed as (
      delete from "kind_slots"
      where "kind_id" in (select "id" from kind)
        and "type" not in (select slot."type" from ${selectSlotRows(slots)})
    ),
    kept as (
      insert into "kind_slots" (
        "kind_id", "type", "required", "tier", "min_count"
      )
      select kind."id", slot."type", slot."required", slot."tier", slot."min_count"
      from kind
      cross join ${selectSlotRows(slots)}
      on conflict ("kind_id", "type") do update set
        "required" = excluded."required",
        "tier" = excluded."tier",
        "min_count" = excluded."min_count"
    )`
  const result = await db.execute(sql`
    with kind as (
      update "kinds" set "name" = coalesce(${name ?? null}::text, "name")
      where "project_id" = ${projectId}::integer and "slug" = ${slug}::text
      returning "id"
    )${slotChanges}
    select "id" from kind
  `)
  if (idRowsSchema.parse(result).rows.length === 0)
    throw new InvalidRecordError(`kind "${slug}" not found`)
}

// The slots of the Kind of the Concept, as a select: the Part type, if the
// slot is required, and if it is filled. A Part fills a slot of its type
// when its home is the Concept or a Concept in it, or when a Joint glues it
// to such a Part. A sunk Part fills nothing. No row: the Concept has no
// Kind.
export function selectConceptSlots(conceptId: SQL) {
  return sql`
    select slot."type", slot."required", (
      with recursive held as (
        select concept."id"
        union all
        select child."id" from "concepts" as child
        join held on child."parent_id" = held."id"
      )
      select count(*) from "parts" as filler
      where filler."type" = slot."type"
        and filler."project_id" = concept."project_id"
        and filler."work_state" <> 'sunk'
        and (
          filler."concept_id" in (select "id" from held)
          or exists (
            select 1 from "joints" as joint
            join "parts" as other
              on other."id" in (joint."part_id", joint."needed_part_id")
            where filler."id" in (joint."part_id", joint."needed_part_id")
              and other."id" <> filler."id"
              and other."concept_id" in (select "id" from held)
          )
        )
    ) >= slot."min_count" as "filled"
    from "concepts" as concept
    join "kind_slots" as slot on slot."kind_id" = concept."kind_id"
    where concept."id" = ${conceptId}`
}

export type ConceptSlot = { type: PartType; required: boolean; filled: boolean }

const conceptSlotsSchema = z.object({
  rows: z.array(
    z.object({
      type: z.enum(schema.partTypes),
      required: z.boolean(),
      filled: z.boolean(),
    }),
  ),
})

// One slot per Part type of the Kind of the Concept. None: the Concept has
// no Kind.
export async function listConceptSlots(
  db: ConceptDb,
  conceptId: number,
): Promise<ConceptSlot[]> {
  const result = await db.execute(
    selectConceptSlots(sql`${conceptId}::integer`),
  )
  return sortSlots(conceptSlotsSchema.parse(result).rows)
}
