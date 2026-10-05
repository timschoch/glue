import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { InvalidRecordError } from './record-errors.ts'
import type { AssignmentRole, LoopStep } from './schema.ts'
import * as schema from './schema.ts'
import { assignmentRoles, loopSteps } from './schema.ts'

// The people of a Project: its members, their usual loop steps, and the
// Concepts and Parts they are Responsible or Co-Author of (D31).
//
// The Neon HTTP driver has no transaction of its own. Thus each function
// writes with one statement.

export { assignmentRoles, loopSteps } from './schema.ts'
export type { AssignmentRole, LoopStep } from './schema.ts'

const { assignments, concepts, members, parts, projects, watchers } = schema

// An account of Neon Auth.
export type Account = { id: string; name: string; email: string }

export type Member = {
  id: number
  // The id of the account.
  userId: string
  name: string
  email: string
  loopSteps: LoopStep[]
}

export type Assignment = {
  id: number
  memberId: number
  role: AssignmentRole
  // The slug of the Concept, or the record id of the Part. One of the two.
  concept: string | null
  part: string | null
}

// The people of a Project as the app shows them. `me` is the member id of
// the person who reads, or null for a person who is no member.
export type People = {
  members: Member[]
  assignments: Assignment[]
  watchers: Watcher[]
  me: number | null
}

const member = {
  id: members.id,
  userId: members.userId,
  name: members.name,
  email: members.email,
  loopSteps: members.loopSteps,
}

function parseInput<TOutput>(inputSchema: z.ZodType<TOutput>, input: unknown) {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success)
    throw new InvalidRecordError(z.prettifyError(parsed.error))
  return parsed.data
}

const accountRowsSchema = z.object({
  rows: z.array(
    z.object({ id: z.string(), name: z.string(), email: z.string() }),
  ),
})

// The account of the e-mail address. Neon Auth keeps the accounts in its own
// schema of the same database.
export async function findAccount(
  db: ConceptDb,
  email: string,
): Promise<Account | undefined> {
  const result = await db.execute(sql`
    select "id"::text as "id", "name", "email" from "neon_auth"."user"
    where lower("email") = lower(${email.trim()}::text)
  `)
  return accountRowsSchema.parse(result).rows.at(0)
}

export function listMembers(
  db: ConceptDb,
  projectSlug: string,
): Promise<Member[]> {
  return db
    .select(member)
    .from(members)
    .innerJoin(projects, eq(members.projectId, projects.id))
    .where(eq(projects.slug, projectSlug))
    .orderBy(asc(members.name), asc(members.id))
}

// The member of the account in the Project.
export async function findMember(
  db: ConceptDb,
  projectSlug: string,
  userId: string,
): Promise<Member | undefined> {
  const found = await db
    .select(member)
    .from(members)
    .innerJoin(projects, eq(members.projectId, projects.id))
    .where(and(eq(projects.slug, projectSlug), eq(members.userId, userId)))
  return found.at(0)
}

const memberRowsSchema = z.object({
  rows: z.array(
    z.object({
      id: z.number(),
      userId: z.string(),
      name: z.string(),
      email: z.string(),
      loopSteps: z.array(z.literal(loopSteps)),
    }),
  ),
})

// Makes the account a member of the Project. An account that is a member
// already keeps its loop steps and takes the name and the e-mail address of
// now.
export async function joinProject(
  db: ConceptDb,
  projectSlug: string,
  account: Account,
): Promise<Member> {
  const result = await db.execute(sql`
    insert into "members" ("project_id", "user_id", "name", "email")
    select "id", ${account.id}::text, ${account.name}::text, ${account.email}::text
    from "projects" where "slug" = ${projectSlug}::text
    on conflict ("project_id", "user_id") do update
      set "name" = excluded."name", "email" = excluded."email"
    returning "id", "user_id" as "userId", "name", "email",
      "loop_steps" as "loopSteps"
  `)
  const joined = memberRowsSchema.parse(result).rows.at(0)
  if (!joined) throw new InvalidRecordError(`${projectSlug} not found`)
  return joined
}

// Adds the account of the e-mail address as a member of the Project.
export async function addMember(
  db: ConceptDb,
  projectSlug: string,
  email: string,
): Promise<Member> {
  const account = await findAccount(db, email)
  if (!account)
    throw new InvalidRecordError(
      `No account has the e-mail address ${email.trim()}.`,
    )
  return joinProject(db, projectSlug, account)
}

export const loopStepsSchema = z.array(z.literal(loopSteps))

// Sets the usual loop steps of the member, in the order of the loop.
export async function setLoopSteps(
  db: ConceptDb,
  projectSlug: string,
  memberId: number,
  input: unknown,
): Promise<void> {
  const picked = new Set(parseInput(loopStepsSchema, input))
  const steps = loopSteps.filter((step) => picked.has(step))
  const result = await db.execute(sql`
    update "members" set "loop_steps" = ${`{${steps.join(',')}}`}::text[]
    where "id" = ${memberId}::integer and "project_id" =
      (select "id" from "projects" where "slug" = ${projectSlug}::text)
    returning "id"
  `)
  if (z.object({ rows: z.array(z.unknown()) }).parse(result).rows.length === 0)
    throw new InvalidRecordError(`member ${memberId} not found`)
}

export function listAssignments(
  db: ConceptDb,
  projectSlug: string,
): Promise<Assignment[]> {
  return db
    .select({
      id: assignments.id,
      memberId: assignments.memberId,
      role: assignments.role,
      concept: concepts.slug,
      part: parts.recordId,
    })
    .from(assignments)
    .innerJoin(members, eq(assignments.memberId, members.id))
    .innerJoin(projects, eq(members.projectId, projects.id))
    .leftJoin(concepts, eq(assignments.conceptId, concepts.id))
    .leftJoin(parts, eq(assignments.partId, parts.id))
    .where(eq(projects.slug, projectSlug))
    .orderBy(asc(assignments.id))
}

const target = {
  // The e-mail address of the member.
  member: z.string().trim().min(1),
  // The slug of the Concept, or the record id of the Part. One of the two.
  concept: z.string().trim().min(1).optional(),
  part: z.string().trim().min(1).optional(),
}
const hasOneTarget = [
  (input: { concept?: string; part?: string }) =>
    (input.concept === undefined) !== (input.part === undefined),
  { error: 'an assignment names a Concept or a Part, one of the two' },
] as const

export const assignmentTargetSchema = z
  .strictObject(target)
  .refine(...hasOneTarget)
export const newAssignmentSchema = z
  .strictObject({ ...target, role: z.literal(assignmentRoles) })
  .refine(...hasOneTarget)

type AssignmentTarget = z.infer<typeof assignmentTargetSchema>

// The rows of the member and of the Concept or Part of an assignment.
function selectTarget(projectSlug: string, input: AssignmentTarget) {
  const found =
    input.part === undefined
      ? sql`select "concepts"."id" as "concept_id", null::integer as "part_id"
          from "concepts" where "concepts"."project_id" = (select "id" from project)
          and "concepts"."slug" = ${input.concept}::text`
      : sql`select null::integer as "concept_id", "parts"."id" as "part_id"
          from "parts" where "parts"."project_id" = (select "id" from project)
          and "parts"."record_id" = ${input.part}::text`
  return sql`
    project as (
      select "id" from "projects" where "slug" = ${projectSlug}::text
    ),
    member as (
      select "id" from "members"
      where "project_id" = (select "id" from project)
        and lower("email") = lower(${input.member}::text)
    ),
    target as (${found})`
}

const foundSchema = z.object({
  rows: z.array(
    z.object({ members: z.coerce.number(), targets: z.coerce.number() }),
  ),
})

// Refuses the write when the Project has no such member, Concept or Part.
function validateFound(
  result: unknown,
  projectSlug: string,
  input: AssignmentTarget,
) {
  const [found] = foundSchema.parse(result).rows
  if (found.members === 0)
    throw new InvalidRecordError(
      `${input.member} is no member of ${projectSlug}.`,
    )
  if (found.targets === 0)
    throw new InvalidRecordError(`${input.part ?? input.concept} not found`)
}

// Makes the member Responsible or Co-Author of the Concept or the Part. A
// Concept or a Part has one Responsible: the new one takes the place of the
// old one. A member that has a role already changes the role.
export async function assign(
  db: ConceptDb,
  projectSlug: string,
  input: unknown,
): Promise<void> {
  const assignment = parseInput(newAssignmentSchema, input)
  const result = await db.execute(sql`
    with ${selectTarget(projectSlug, assignment)},
    removed as (
      delete from "assignments" using target
      where ${assignment.role}::text = 'responsible'
        and "assignments"."role" = 'responsible'
        and "assignments"."concept_id" is not distinct from target."concept_id"
        and "assignments"."part_id" is not distinct from target."part_id"
        and "assignments"."member_id" <> (select "id" from member)
    ),
    written as (
      insert into "assignments" ("member_id", "concept_id", "part_id", "role")
      select member."id", target."concept_id", target."part_id", ${assignment.role}::text
      from member, target
      on conflict ("member_id", "concept_id", "part_id")
        do update set "role" = excluded."role"
    )
    select (select count(*) from member) as "members",
      (select count(*) from target) as "targets"
  `)
  validateFound(result, projectSlug, assignment)
}

// A member who watches a Part (D47). Watching is not owning: the owner of a
// Part is its Responsible.
export type Watcher = {
  memberId: number
  // The record id of the Part.
  part: string
}

export const watcherSchema = z.strictObject({
  member: target.member,
  part: z.string().trim().min(1),
})

// The watchers of the Project, or of one Part of it, by Part and member.
export function listWatchers(
  db: ConceptDb,
  projectSlug: string,
  recordId?: string,
): Promise<Watcher[]> {
  return db
    .select({ memberId: watchers.memberId, part: parts.recordId })
    .from(watchers)
    .innerJoin(parts, eq(watchers.partId, parts.id))
    .innerJoin(projects, eq(parts.projectId, projects.id))
    .where(
      and(
        eq(projects.slug, projectSlug),
        recordId === undefined ? undefined : eq(parts.recordId, recordId),
      ),
    )
    .orderBy(asc(watchers.partId), asc(watchers.memberId))
}

// The member watches the Part. A member who watches it already stays one
// watcher.
export async function watch(
  db: ConceptDb,
  projectSlug: string,
  input: unknown,
): Promise<void> {
  const watcher = parseInput(watcherSchema, input)
  const result = await db.execute(sql`
    with ${selectTarget(projectSlug, watcher)},
    written as (
      insert into "watchers" ("part_id", "member_id")
      select target."part_id", member."id" from member, target
      on conflict do nothing
    )
    select (select count(*) from member) as "members",
      (select count(*) from target) as "targets"
  `)
  validateFound(result, projectSlug, watcher)
}

// The member stops watching the Part.
export async function unwatch(
  db: ConceptDb,
  projectSlug: string,
  input: unknown,
): Promise<void> {
  const watcher = parseInput(watcherSchema, input)
  const result = await db.execute(sql`
    with ${selectTarget(projectSlug, watcher)},
    removed as (
      delete from "watchers" using target
      where "watchers"."member_id" = (select "id" from member)
        and "watchers"."part_id" = target."part_id"
    )
    select (select count(*) from member) as "members",
      (select count(*) from target) as "targets"
  `)
  validateFound(result, projectSlug, watcher)
}

// Takes the Concept or the Part from the member.
export async function unassign(
  db: ConceptDb,
  projectSlug: string,
  input: unknown,
): Promise<void> {
  const assignment = parseInput(assignmentTargetSchema, input)
  const result = await db.execute(sql`
    with ${selectTarget(projectSlug, assignment)},
    removed as (
      delete from "assignments" using target
      where "assignments"."member_id" = (select "id" from member)
        and "assignments"."concept_id" is not distinct from target."concept_id"
        and "assignments"."part_id" is not distinct from target."part_id"
    )
    select (select count(*) from member) as "members",
      (select count(*) from target) as "targets"
  `)
  validateFound(result, projectSlug, assignment)
}
