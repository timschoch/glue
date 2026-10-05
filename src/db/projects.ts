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

// Lets the Parts of the Project need the published Parts of the other
// Project (D45). The reference goes one way.
export async function addProjectReference(
  db: ConceptDb,
  projectSlug: string,
  referencedSlug: string,
): Promise<void> {
  if (projectSlug === referencedSlug)
    throw new InvalidRecordError('a Project cannot reference itself')
  const projectId = await getProjectId(db, projectSlug)
  const referencedProjectId = await getProjectId(db, referencedSlug)
  await db
    .insert(schema.projectReferences)
    .values({ projectId, referencedProjectId })
    .onConflictDoNothing()
}

// Each pair of Projects with a reference: the first may reference the
// second.
export function listProjectReferences(db: ConceptDb) {
  return db.select().from(schema.projectReferences)
}

// Says if the Parts of the first Project may need the Parts of the second.
export async function canReference(
  db: ConceptDb,
  projectSlug: string,
  referencedSlug: string,
): Promise<boolean> {
  const [project, referenced] = await Promise.all([
    findProduct(db, projectSlug),
    findProduct(db, referencedSlug),
  ])
  if (!project || !referenced) return false
  const { projectReferences } = schema
  const found = await db
    .select()
    .from(projectReferences)
    .where(
      and(
        eq(projectReferences.projectId, project.id),
        eq(projectReferences.referencedProjectId, referenced.id),
      ),
    )
  return found.length > 0
}

// The message of a Joint that crosses the edge of two Projects in a
// direction that no reference allows.
export function toRefusedReferenceMessage(
  projectSlug: string,
  neededSlug: string,
) {
  return `a Part of Project "${projectSlug}" cannot need a Part of Project "${neededSlug}"`
}

// The Project with the Glue concept, and the Project with the build of
// Glue (D45).
export const CONCEPT_PROJECT = 'glue'
export const BUILD_PROJECT = 'glue-build'

// The Project that the tools of the build run read and write: the one of
// GLUE_PROJECT, or the build Project when it exists, or the one with the
// Glue concept.
export async function findBuildProject(
  db: ConceptDb,
  environment: Record<string, string | undefined> = process.env,
): Promise<string> {
  if (environment.GLUE_PROJECT) return environment.GLUE_PROJECT
  return (await findProduct(db, BUILD_PROJECT))
    ? BUILD_PROJECT
    : CONCEPT_PROJECT
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
