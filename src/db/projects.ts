import { and, eq, isNotNull, sql } from 'drizzle-orm'

import type { ConceptDb } from './client.ts'
import { InvalidRecordError, ProductNotFoundError } from './record-errors.ts'
import * as schema from './schema.ts'

// A Project as a row, and its settings: the repository, the analytics
// project and the social handle.

const { projects } = schema

export async function findProduct(db: ConceptDb, productSlug: string) {
  const found = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, productSlug))
  return found.at(0)
}

// The row id of the Project of the slug.
export async function getProjectId(db: ConceptDb, projectSlug: string) {
  const project = await findProduct(db, projectSlug)
  if (!project) throw new ProductNotFoundError(projectSlug)
  return project.id
}

const REPOSITORY = /^[\w.-]+\/[\w.-]+$/

export async function setProductRepository(
  db: ConceptDb,
  productSlug: string,
  repository: string,
): Promise<void> {
  if (!REPOSITORY.test(repository)) {
    throw new InvalidRecordError(
      `repository "${repository}" must look like owner/name`,
    )
  }
  const updated = await db
    .update(projects)
    .set({ repository })
    .where(eq(projects.slug, productSlug))
    .returning({ id: projects.id })
  if (updated.length === 0) throw new ProductNotFoundError(productSlug)
}

// null removes it: the Product's Goals are not measured.
export async function setAnalyticsProject(
  db: ConceptDb,
  productSlug: string,
  analyticsProject: string | null,
): Promise<void> {
  const updated = await db
    .update(projects)
    .set({ analyticsProject })
    .where(eq(projects.slug, productSlug))
    .returning({ id: projects.id })
  if (updated.length === 0) throw new ProductNotFoundError(productSlug)
}

// null removes it: Glue stops reading the Product's comments. A new handle is
// read from its first comment; the same handle keeps its read position.
export async function setSocialHandle(
  db: ConceptDb,
  productSlug: string,
  socialHandle: string | null,
): Promise<void> {
  const updated = await db
    .update(projects)
    .set({
      socialHandle,
      commentsReadUntil: sql`case when ${projects.socialHandle} is not distinct from ${socialHandle}::text then ${projects.commentsReadUntil} end`,
    })
    .where(eq(projects.slug, productSlug))
    .returning({ id: projects.id })
  if (updated.length === 0) throw new ProductNotFoundError(productSlug)
}

// A Product whose public comments Glue reads, with its read position.
export type SocialProduct = {
  id: number
  slug: string
  handle: string
  readUntil: Date | null
}

// The Products with a social handle: all of them, or the one of the slug.
export async function listSocialProducts(
  db: ConceptDb,
  productSlug?: string,
): Promise<SocialProduct[]> {
  const rows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      handle: projects.socialHandle,
      readUntil: projects.commentsReadUntil,
    })
    .from(projects)
    .where(
      and(
        isNotNull(projects.socialHandle),
        productSlug === undefined ? undefined : eq(projects.slug, productSlug),
      ),
    )
    .orderBy(projects.id)
  return rows.flatMap(({ handle, ...row }) =>
    handle ? [{ ...row, handle }] : [],
  )
}
