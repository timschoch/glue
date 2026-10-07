import { createHash, randomBytes } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'

import type { ConceptDb } from './client.ts'
import { addProject } from './part-records.ts'
import { InvalidRecordError } from './record-errors.ts'
import { members, projects, tokens } from './schema.ts'

const TOKEN_BYTES = 32

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

// The member that a token belongs to (glue/D67): a write with the token is
// a write of this member.
export type TokenMember = { name: string; email: string }

// Creates the Product when it does not exist yet.
// The token is returned once and never stored. `memberEmail` is the e-mail
// address of the member of the Product that the token belongs to: a person,
// or an agent. Without it the token belongs to nobody.
export async function createToken(
  db: ConceptDb,
  productSlug: string,
  name: string,
  memberEmail?: string,
): Promise<{ id: number; token: string }> {
  const projectId = await addProject(db, productSlug)
  let memberId: number | undefined
  if (memberEmail !== undefined) {
    const email = memberEmail.trim().toLowerCase()
    const found = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.projectId, projectId),
          eq(sql`lower(${members.email})`, email),
        ),
      )
    memberId = found.at(0)?.id
    if (memberId === undefined)
      throw new InvalidRecordError(`${email} is no member of ${productSlug}.`)
  }
  const token = `glue_${randomBytes(TOKEN_BYTES).toString('base64url')}`
  const [row] = await db
    .insert(tokens)
    .values({ projectId, memberId, name, hash: hashToken(token) })
    .returning({ id: tokens.id })
  return { id: row.id, token }
}

// The Project that the token opens, and the member that it belongs to.
export async function findToken(
  db: ConceptDb,
  token: string,
): Promise<{ project: string; member: TokenMember | null } | undefined> {
  const found = await db
    .select({
      project: projects.slug,
      name: members.name,
      email: members.email,
    })
    .from(tokens)
    .innerJoin(projects, eq(tokens.projectId, projects.id))
    .leftJoin(members, eq(tokens.memberId, members.id))
    .where(eq(tokens.hash, hashToken(token)))
  const row = found.at(0)
  if (!row) return undefined
  const { project, name, email } = row
  return {
    project,
    member: name === null || email === null ? null : { name, email },
  }
}

// `member` is the e-mail address of the member that the token belongs to.
export async function listTokens(db: ConceptDb) {
  return db
    .select({
      id: tokens.id,
      product: projects.slug,
      name: tokens.name,
      member: members.email,
      createdAt: tokens.createdAt,
    })
    .from(tokens)
    .innerJoin(projects, eq(tokens.projectId, projects.id))
    .leftJoin(members, eq(tokens.memberId, members.id))
    .orderBy(tokens.id)
}

// Returns false when no token has this id.
export async function deleteToken(db: ConceptDb, id: number): Promise<boolean> {
  const deleted = await db
    .delete(tokens)
    .where(eq(tokens.id, id))
    .returning({ id: tokens.id })
  return deleted.length > 0
}
