import type { SQL } from 'drizzle-orm'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { ConceptNotFoundError, InvalidRecordError } from './record-errors.ts'
import * as schema from './schema.ts'

// A question about a Contract Version (glue/D62). A builder, a person or an
// agent, asks about the Version that it builds with. The member who is
// Responsible for the Concept answers. The Concept keeps the question and
// the answer with the Version, so the next builder reads them with the
// Contract.
//
// The question is no Part: a Part that is not solid blocks the next
// sign-off of the Concept, and a question of a builder must not.

const { concepts, contractQuestions, contractVersions, projects } = schema

export type ContractQuestion = {
  id: number
  // The slug and the title of the Concept.
  concept: string
  conceptTitle: string
  // The Contract Version that the builder asked about.
  version: number
  // The Concept has a newer Version.
  stale: boolean
  text: string
  // The name of the member, or of who holds the token.
  askedBy: string
  askedAt: string
  // null: the question is open.
  answer: { text: string; by: string; at: string } | null
}

export const newContractQuestionSchema = z.strictObject({
  text: z.string().trim().min(1).meta({ description: 'The question' }),
  askedBy: z.string().trim().min(1).meta({
    description: 'The name of who asks: a member, or the agent of a token',
  }),
  version: z.int().positive().optional().meta({
    description:
      'The Contract Version that the builder builds with. None: the newest one',
  }),
})

export type NewContractQuestion = z.input<typeof newContractQuestionSchema>

export const contractQuestionAnswerSchema = z.strictObject({
  text: z.string().trim().min(1).meta({ description: 'The answer' }),
  answeredBy: z.string().trim().min(1).meta({
    description: 'The name of who answers',
  }),
})

export type ContractQuestionAnswer = z.input<
  typeof contractQuestionAnswerSchema
>

function parseInput<TOutput>(inputSchema: z.ZodType<TOutput>, input: unknown) {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success)
    throw new InvalidRecordError(z.prettifyError(parsed.error))
  return parsed.data
}

const newestVersion = sql<number>`(
  select max("contract_versions"."version") from "contract_versions"
  where "contract_versions"."concept_id" = ${concepts.id}
)`

// The questions that match, the newest first.
async function listQuestions(
  db: ConceptDb,
  matches: SQL | undefined,
): Promise<ContractQuestion[]> {
  const found = await db
    .select({
      id: contractQuestions.id,
      concept: concepts.slug,
      conceptTitle: concepts.title,
      version: contractQuestions.version,
      newestVersion,
      text: contractQuestions.text,
      askedBy: contractQuestions.askedBy,
      askedAt: contractQuestions.askedAt,
      answer: contractQuestions.answer,
      answeredBy: contractQuestions.answeredBy,
      answeredAt: contractQuestions.answeredAt,
    })
    .from(contractQuestions)
    .innerJoin(concepts, eq(contractQuestions.conceptId, concepts.id))
    .innerJoin(projects, eq(concepts.projectId, projects.id))
    .where(matches)
    .orderBy(desc(contractQuestions.askedAt), desc(contractQuestions.id))

  return found.map((row) => ({
    id: row.id,
    concept: row.concept,
    conceptTitle: row.conceptTitle,
    version: row.version,
    stale: row.version < row.newestVersion,
    text: row.text,
    askedBy: row.askedBy,
    askedAt: row.askedAt.toISOString(),
    answer:
      row.answer === null || row.answeredBy === null || row.answeredAt === null
        ? null
        : {
            text: row.answer,
            by: row.answeredBy,
            at: row.answeredAt.toISOString(),
          },
  }))
}

const isConcept = (projectSlug: string, conceptSlug: string) =>
  and(eq(projects.slug, projectSlug), eq(concepts.slug, conceptSlug))

// The questions and the answers of the Concept, the newest first.
export function listContractQuestions(
  db: ConceptDb,
  projectSlug: string,
  conceptSlug: string,
): Promise<ContractQuestion[]> {
  return listQuestions(db, isConcept(projectSlug, conceptSlug))
}

// The member is Responsible for the Concept of the question. A Concept with
// no Responsible: the member is a Co-Author of it.
const answers = (memberEmail: string) => sql`exists (
  select 1 from "assignments"
  inner join "members" on "members"."id" = "assignments"."member_id"
  where "assignments"."concept_id" = ${concepts.id}
    and lower("members"."email") = lower(${memberEmail}::text)
    and (
      "assignments"."role" = 'responsible'
      or not exists (
        select 1 from "assignments" as responsible
        where responsible."concept_id" = ${concepts.id}
          and responsible."role" = 'responsible'
      )
    )
)`

// The open questions in Mine of the member: see `answers`. Without the
// e-mail address of a member: each open question of the Project.
export function listMineContractQuestions(
  db: ConceptDb,
  projectSlug: string,
  memberEmail?: string,
): Promise<ContractQuestion[]> {
  return listQuestions(
    db,
    and(
      eq(projects.slug, projectSlug),
      isNull(contractQuestions.answer),
      memberEmail === undefined ? undefined : answers(memberEmail),
    ),
  )
}

async function getQuestion(db: ConceptDb, projectSlug: string, id: number) {
  const found = await listQuestions(
    db,
    and(eq(projects.slug, projectSlug), eq(contractQuestions.id, id)),
  )
  const question = found.at(0)
  if (!question) throw new InvalidRecordError(`Question ${id} not found`)
  return question
}

// Asks about a Contract Version of the Concept: the newest one, when the
// question names none. A question about an older Version is stale.
export async function askContractQuestion(
  db: ConceptDb,
  projectSlug: string,
  conceptSlug: string,
  input: NewContractQuestion,
  now = new Date(),
): Promise<ContractQuestion> {
  const { text, askedBy, version } = parseInput(
    newContractQuestionSchema,
    input,
  )
  const found = await db
    .select({ id: concepts.id })
    .from(concepts)
    .innerJoin(projects, eq(concepts.projectId, projects.id))
    .where(isConcept(projectSlug, conceptSlug))
  const concept = found.at(0)
  if (!concept) throw new ConceptNotFoundError(conceptSlug)
  const versions = await db
    .select({ version: contractVersions.version })
    .from(contractVersions)
    .where(
      and(
        eq(contractVersions.conceptId, concept.id),
        version === undefined
          ? undefined
          : eq(contractVersions.version, version),
      ),
    )
    .orderBy(desc(contractVersions.version))
    .limit(1)
  const asked = versions.at(0)
  if (!asked)
    throw new InvalidRecordError(
      version === undefined
        ? `"${conceptSlug}" has no Contract Version`
        : `"${conceptSlug}" has no Contract Version ${version}`,
    )
  const [added] = await db
    .insert(contractQuestions)
    .values({
      conceptId: concept.id,
      version: asked.version,
      text,
      askedBy,
      askedAt: now,
    })
    .returning({ id: contractQuestions.id })
  return getQuestion(db, projectSlug, added.id)
}

// Answers the open question of the Project. A question has one answer.
export async function answerContractQuestion(
  db: ConceptDb,
  projectSlug: string,
  id: number,
  input: ContractQuestionAnswer,
  now = new Date(),
): Promise<ContractQuestion> {
  const { text, answeredBy } = parseInput(contractQuestionAnswerSchema, input)
  await getQuestion(db, projectSlug, id)
  const answered = await db
    .update(contractQuestions)
    .set({ answer: text, answeredBy, answeredAt: now })
    .where(and(eq(contractQuestions.id, id), isNull(contractQuestions.answer)))
    .returning({ id: contractQuestions.id })
  if (answered.length === 0)
    throw new InvalidRecordError(`Question ${id} has an answer`)
  return getQuestion(db, projectSlug, id)
}
