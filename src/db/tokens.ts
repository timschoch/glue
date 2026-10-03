import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'

import type { ConceptDb } from './client.ts'
import { addProductId } from './concept-records.ts'
import { projects, tokens } from './schema.ts'

const TOKEN_BYTES = 32

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

// Creates the Product when it does not exist yet.
// The token is returned once and never stored.
export async function createToken(
  db: ConceptDb,
  productSlug: string,
  name: string,
): Promise<{ id: number; token: string }> {
  const projectId = await addProductId(db, productSlug)
  const token = `glue_${randomBytes(TOKEN_BYTES).toString('base64url')}`
  const [row] = await db
    .insert(tokens)
    .values({ projectId, name, hash: hashToken(token) })
    .returning({ id: tokens.id })
  return { id: row.id, token }
}

export async function findProductByToken(
  db: ConceptDb,
  token: string,
): Promise<string | undefined> {
  const found = await db
    .select({ slug: projects.slug })
    .from(tokens)
    .innerJoin(projects, eq(tokens.projectId, projects.id))
    .where(eq(tokens.hash, hashToken(token)))
  return found.at(0)?.slug
}

export async function listTokens(db: ConceptDb) {
  return db
    .select({
      id: tokens.id,
      product: projects.slug,
      name: tokens.name,
      createdAt: tokens.createdAt,
    })
    .from(tokens)
    .innerJoin(projects, eq(tokens.projectId, projects.id))
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
