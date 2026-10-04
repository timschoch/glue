import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { kinds } from './kinds.ts'
import type { Kind } from './kinds.ts'
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
                jsonb_agg(needed."record_id" order by joint."id"),
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

const signedSchema = z.object({
  rows: z.array(z.object({ version: z.number() })),
})

// Signs off the Concept: freezes its Parts as the next Contract Version, and
// gives back the number. One statement reads the Parts and writes the
// Version, so a Version never holds a Part that was not solid. Of two
// sign-offs at the same time, the database refuses the second number.
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
    )
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
