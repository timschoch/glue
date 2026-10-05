import { and, desc, eq, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { kinds } from './kinds.ts'
import type { Kind } from './kinds.ts'
import { flagParts } from './part-trust.ts'
import type { PartSummary } from './parts.ts'
import { ConceptNotFoundError, InvalidRecordError } from './record-errors.ts'
import { sortById } from './record-id.ts'
import * as schema from './schema.ts'
import type { FrozenPart, PartType } from './schema.ts'

// The Contract of a Concept (D28): a sign-off freezes the Parts of the
// Concept, and of the Concepts in it, as one Contract Version with a
// checksum. A sunk Part is at its end, so no Version holds it.

export type { FrozenPart } from './schema.ts'

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

export type ContractVersion = {
  version: number
  checksum: string
  signedBy: string
  signedAt: string
}

// Where a Concept is against its Contract.
export type ContractState = {
  // The newest Version first.
  versions: ContractVersion[]
  // The Parts changed after the newest Version.
  ahead: boolean
  // The Parts without Trust solid. A sign-off needs none.
  blocking: PartSummary[]
}

export type Contract = ContractVersion & {
  // The slug of the Concept.
  concept: string
  title: string
  kind: Kind | null
  // A higher number than `version`: this Version is superseded.
  newestVersion: number
  tier1: FrozenPart[]
  tier2: FrozenPart[]
  // One slot per Part type of the Kind. Empty when the Concept has no Kind.
  slots: { type: PartType; filled: boolean }[]
}

const { concepts, contractVersions, projects } = schema

async function findConceptRow(
  db: ConceptDb,
  projectSlug: string,
  conceptSlug: string,
) {
  const found = await db
    .select({
      id: concepts.id,
      slug: concepts.slug,
      title: concepts.title,
      kind: concepts.kind,
    })
    .from(concepts)
    .innerJoin(projects, eq(concepts.projectId, projects.id))
    .where(and(eq(projects.slug, projectSlug), eq(concepts.slug, conceptSlug)))
  return found.at(0)
}

// The Parts of the Concept as they are now, as common table expressions:
// `live` has the Parts, `frozen` has them as the JSON that a Version holds,
// and `newest` has the newest Version. The statement starts with
// `with recursive`.
function selectLiveParts(conceptId: number) {
  return sql`
    tree as (
      select "id" from "concepts" where "id" = ${conceptId}::integer
      union all
      select child."id" from "concepts" as child
      join tree on child."parent_id" = tree."id"
    ),
    live as (
      select
        part.*,
        concept."slug" as "concept_slug",
        concept."title" as "concept_title"
      from "parts" as part
      join "concepts" as concept on concept."id" = part."concept_id"
      where part."concept_id" in (select "id" from tree)
        and part."work_state" <> 'sunk'
    ),
    frozen as (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', live."record_id",
            'type', live."type",
            'title', live."title",
            'body', live."body",
            'concept', live."concept_slug",
            'status', live."status",
            'owner', live."owner",
            'date', live."date",
            'source', live."source",
            'metric', live."metric",
            'enforcedBy', live."enforced_by",
            'evidenceLevel', live."evidence_level",
            'needs', (
              select coalesce(
                jsonb_agg(
                  case
                    when needed."project_id" = live."project_id"
                      then needed."record_id"
                    -- A reference: glue/D4 (D45).
                    else (
                      select "slug" from "projects"
                      where "id" = needed."project_id"
                    ) || '/' || needed."record_id"
                  end
                  order by joint."id"
                ),
                '[]'::jsonb
              )
              from "joints" as joint
              join "parts" as needed on needed."id" = joint."needed_part_id"
              where joint."part_id" = live."id"
            )
          )
          order by live."id"
        ),
        '[]'::jsonb
      ) as "parts"
      from live
    ),
    newest as (
      select "version", "checksum" from "contract_versions"
      where "concept_id" = ${conceptId}::integer
      order by "version" desc
      limit 1
    )`
}

// jsonb as text has one form for one value, so the same Parts give the same
// checksum.
const liveChecksum = sql`encode(sha256(convert_to(frozen."parts"::text, 'UTF8')), 'hex')`

const liveStateSchema = z.object({
  rows: z
    .array(
      z.object({
        checksum: z.string(),
        part_count: z.number(),
        newest_version: z.number().nullable(),
        newest_checksum: z.string().nullable(),
        blocking: z.array(z.custom<PartSummary>()),
      }),
    )
    .length(1),
})

async function readLiveState(db: ConceptDb, conceptId: number) {
  const result = await db.execute(sql`
    with recursive ${selectLiveParts(conceptId)}
    select
      ${liveChecksum} as "checksum",
      jsonb_array_length(frozen."parts") as "part_count",
      (select "version" from newest) as "newest_version",
      (select "checksum" from newest) as "newest_checksum",
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', live."record_id",
              'type', live."type",
              'title', live."title",
              'status', live."status",
              'trust', live."trust",
              'workState', live."work_state",
              'concept', live."concept_slug",
              'conceptTitle', live."concept_title"
            )
            order by live."id"
          ),
          '[]'::jsonb
        )
        from live
        where live."trust" <> 'solid'
      ) as "blocking"
    from frozen
  `)
  return liveStateSchema.parse(result).rows[0]
}

function listVersions(db: ConceptDb, conceptId: number) {
  return db
    .select()
    .from(contractVersions)
    .where(eq(contractVersions.conceptId, conceptId))
    .orderBy(desc(contractVersions.version))
}

function toVersion(
  row: Awaited<ReturnType<typeof listVersions>>[number],
): ContractVersion {
  return {
    version: row.version,
    checksum: row.checksum,
    signedBy: row.signedBy,
    signedAt: row.signedAt.toISOString(),
  }
}

// undefined: the Project has no such Concept.
export async function findContractState(
  db: ConceptDb,
  projectSlug: string,
  conceptSlug: string,
): Promise<ContractState | undefined> {
  const concept = await findConceptRow(db, projectSlug, conceptSlug)
  if (!concept) return undefined
  const [versions, live] = await Promise.all([
    listVersions(db, concept.id),
    readLiveState(db, concept.id),
  ])
  return {
    versions: versions.map(toVersion),
    ahead:
      live.newest_checksum !== null && live.newest_checksum !== live.checksum,
    blocking: live.blocking,
  }
}

function listTier(parts: FrozenPart[], types: readonly PartType[]) {
  return types.flatMap((type) =>
    sortById(parts.filter((part) => part.type === type)),
  )
}

// The newest Contract Version of the Concept, or the one of the number.
// undefined: the Concept has no such Version.
export async function findContract(
  db: ConceptDb,
  projectSlug: string,
  conceptSlug: string,
  version?: number,
): Promise<Contract | undefined> {
  const concept = await findConceptRow(db, projectSlug, conceptSlug)
  if (!concept) return undefined
  const versions = await listVersions(db, concept.id)
  const found =
    version === undefined
      ? versions.at(0)
      : versions.find((row) => row.version === version)
  if (!found) return undefined
  const slotTypes = concept.kind === null ? [] : kinds[concept.kind].slots

  return {
    ...toVersion(found),
    concept: concept.slug,
    title: concept.title,
    kind: concept.kind,
    newestVersion: versions[0].version,
    tier1: listTier(found.parts, tier1Types),
    tier2: listTier(found.parts, tier2Types),
    slots: slotTypes.map((type) => ({
      type,
      filled: found.parts.some((part) => part.type === type),
    })),
  }
}

// The fields of a Part that two Contract Versions can hold with another
// value, in the order that a change lists them.
export const frozenFields = [
  'type',
  'title',
  'body',
  'concept',
  'status',
  'owner',
  'date',
  'source',
  'metric',
  'enforcedBy',
  'evidenceLevel',
  'needs',
] as const satisfies Exclude<keyof FrozenPart, 'id'>[]

// What a new Contract Version changed for a Joint (D46).
export type VersionChange = {
  // The slug of the Concept of the needed Part.
  concept: string
  // The Version that the Joint has.
  builtWith: number
  newest: number
  // The fields of the needed Part that the two Versions hold with another
  // value. `before` is null for each field when Version `builtWith` does
  // not hold the Part.
  changes: {
    field: (typeof frozenFields)[number]
    before: string | null
    after: string | null
  }[]
}

const versionChangesSchema = z.object({
  rows: z.array(
    z.object({
      record_id: z.string(),
      concept: z.string(),
      built_with: z.number(),
      newest: z.number(),
      before: z.custom<FrozenPart>().nullable(),
      after: z.custom<FrozenPart>().nullable(),
    }),
  ),
})

function formatFrozenValue(value: FrozenPart[keyof FrozenPart] | undefined) {
  if (value == null) return null
  return Array.isArray(value) ? value.join(', ') : value
}

function listChanges(before: FrozenPart | null, after: FrozenPart | null) {
  return frozenFields.flatMap((field) => {
    const change = {
      field,
      before: formatFrozenValue(before?.[field]),
      after: formatFrozenValue(after?.[field]),
    }
    return change.before === change.after ? [] : [change]
  })
}

// For each Joint of the Part with a Contract Version: what the newest
// Version of the Concept of the needed Part changed in that Part, by the
// record id of the needed Part.
export async function listVersionChanges(
  db: ConceptDb,
  partId: number,
): Promise<Map<string, VersionChange>> {
  const result = await db.execute(sql`
    select
      needed."record_id",
      concept."slug" as "concept",
      joint."contract_version" as "built_with",
      newest."version" as "newest",
      ${selectFrozenPart(sql`built."parts"`, sql`needed."record_id"`)} as "before",
      ${selectFrozenPart(sql`newest."parts"`, sql`needed."record_id"`)} as "after"
    from "joints" as joint
    join "parts" as needed on needed."id" = joint."needed_part_id"
    join "concepts" as concept on concept."id" = needed."concept_id"
    join "contract_versions" as built
      on built."concept_id" = needed."concept_id"
      and built."version" = joint."contract_version"
    cross join lateral (
      select "version", "parts" from "contract_versions"
      where "concept_id" = needed."concept_id"
      order by "version" desc
      limit 1
    ) as newest
    where joint."part_id" = ${partId}::integer
  `)
  return new Map(
    versionChangesSchema.parse(result).rows.map((row) => [
      row.record_id,
      {
        concept: row.concept,
        builtWith: row.built_with,
        newest: row.newest,
        changes: listChanges(row.before, row.after),
      },
    ]),
  )
}

const signedSchema = z.object({
  rows: z.array(z.object({ version: z.number() })),
})

// The Part of the record id as the Version holds it. null: it does not.
function selectFrozenPart(frozenParts: SQL, recordId: SQL) {
  return sql`(
    select item from jsonb_array_elements(${frozenParts}) as item
    where item->>'id' = ${recordId}
  )`
}

// Signs off the Concept: freezes its Parts as the next Contract Version, and
// gives back the number. One statement reads the Parts and writes the
// Version, so a Version never holds a Part that was not solid. Of two
// sign-offs at the same time, the database refuses the second number.
// The new Version flags each Part that a Joint with an older Version glues
// to a Part of the Concept, when the new Version holds that Part in another
// state than the Version of the Joint (D46). Trust goes one step far, as in
// spreadTrust: a draft and a sunk Part get no flag.
export async function signContract(
  db: ConceptDb,
  projectSlug: string,
  conceptSlug: string,
  signedBy: string,
): Promise<number> {
  const concept = await findConceptRow(db, projectSlug, conceptSlug)
  if (!concept) throw new ConceptNotFoundError(conceptSlug)
  const result = await db.execute(sql`
    with recursive ${selectLiveParts(concept.id)},
    signed as (
      insert into "contract_versions" (
        "concept_id", "version", "checksum", "parts", "signed_by"
      )
      select
        ${concept.id}::integer,
        coalesce((select "version" from newest), 0) + 1,
        ${liveChecksum},
        frozen."parts",
        ${signedBy}::text
      from frozen
      where jsonb_array_length(frozen."parts") > 0
        and not exists (select 1 from live where live."trust" <> 'solid')
        and ${liveChecksum} is distinct from (select "checksum" from newest)
      returning "version"
    ),
    added_flags as (
      insert into "flags" ("part_id", "cause_part_id", "reason")
      select needing."id", needed."id", 'new-version'
      from signed
      cross join frozen
      join "parts" as needed on needed."concept_id" = ${concept.id}::integer
      join "joints" as joint
        on joint."needed_part_id" = needed."id"
        and joint."contract_version" < signed."version"
      join "parts" as needing on needing."id" = joint."part_id"
      join "contract_versions" as built
        on built."concept_id" = needed."concept_id"
        and built."version" = joint."contract_version"
      cross join lateral (
        select ${selectFrozenPart(sql`frozen."parts"`, sql`needed."record_id"`)}
      ) as signed_part ("part")
      where needing."work_state" not in ('draft', 'sunk')
        and signed_part."part" is not null
        and signed_part."part" is distinct from ${selectFrozenPart(sql`built."parts"`, sql`needed."record_id"`)}
      on conflict ("part_id", "cause_part_id", "reason")
        where "closed_at" is null
        do update set "created_at" = now()
      returning "part_id"
    ),
    flagged as (${flagParts(sql`select "part_id" from added_flags`)})
    select "version" from signed
  `)
  const signed = signedSchema.parse(result).rows.at(0)
  if (signed) return signed.version

  const live = await readLiveState(db, concept.id)
  if (live.blocking.length > 0)
    throw new InvalidRecordError(
      `sign-off needs Trust solid: ${live.blocking.map(({ id }) => id).join(', ')}`,
    )
  throw new InvalidRecordError(
    live.part_count === 0
      ? `"${conceptSlug}" has no Parts`
      : `"${conceptSlug}" did not change since Version ${live.newest_version}`,
  )
}
