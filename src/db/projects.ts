import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import {
  InvalidRecordError,
  isUniqueViolation,
  ProductNotFoundError,
} from './record-errors.ts'
import { parseInput, slug as slugSchema } from './record-input.ts'
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

export const projectChangeSchema = z.strictObject({
  name: z.string().optional(),
  slug: z.string().optional().meta({
    description:
      'The new address of the Project: lower case letters, digits and "-". The root Concept takes it too',
  }),
})

export type ProjectChange = z.input<typeof projectChangeSchema>

// The first words of an address of the app that is no Project. No Project
// takes one as its address.
const FIXED_PATHS = ['api', 'sign-in', 'sign-up']

function escapeRegExp(text: string) {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

// Gives the Project a new name, a new address, or both (glue/D74). Its
// Parts, Joints, members and tokens stay with it: they hold its row id. In
// the same write, what holds the address as text follows: the root Concept,
// which has the slug of its Project, and the body of each Part that names a
// record of the Project, as `old#D12` or as `#old/D12`. A root Concept with
// the old name takes the new name. Gives back the address and the name that
// the Project has now.
export async function renameProject(
  db: ConceptDb,
  projectSlug: string,
  change: ProjectChange,
): Promise<{ slug: string; name: string }> {
  const input = parseInput(projectChangeSchema, change)
  if (input.name === undefined && input.slug === undefined)
    throw new InvalidRecordError('send at least one field')
  const name = input.name?.trim()
  if (name === '')
    throw new InvalidRecordError('a Project needs a name', { field: 'name' })
  const { slug } = input
  if (slug !== undefined && !slugSchema.safeParse(slug).success)
    throw new InvalidRecordError(
      'an address has lower case letters, digits and "-" only',
      { field: 'slug' },
    )
  if (slug !== undefined && FIXED_PATHS.includes(slug))
    throw new InvalidRecordError(`Glue uses the address "${slug}" itself`, {
      field: 'slug',
    })
  const project = await findProduct(db, projectSlug)
  if (!project) throw new ProductNotFoundError(projectSlug)

  const nextSlug = slug ?? project.slug
  const nextName = name ?? project.name
  const old = escapeRegExp(project.slug)
  // A mention ends where its record id ends, so the address before `#` is
  // the whole word.
  const mentions =
    nextSlug === project.slug
      ? sql``
      : sql`,
    mentions as (
      update "parts" set "body" = regexp_replace(
        regexp_replace(
          "body",
          ${`(^|[^a-z0-9-])${old}(#[a-z][0-9]+)`}::text,
          ${`\\1${nextSlug}\\2`}::text,
          'gi'
        ),
        ${`#${old}(/[a-z][0-9]+)`}::text,
        ${`#${nextSlug}\\1`}::text,
        'gi'
      )
      where "body" ~* ${`${old}#|#${old}/`}::text
    )`
  try {
    await db.execute(sql`
      with project as (
        update "projects"
        set "slug" = ${nextSlug}::text, "name" = ${nextName}::text
        where "id" = ${project.id}::integer
        returning "id"
      ),
      root as (
        update "concepts" set
          "slug" = ${nextSlug}::text,
          "title" = case
            when "title" = ${project.name}::text then ${nextName}::text
            else "title"
          end
        where "project_id" = ${project.id}::integer and "parent_id" is null
      )${mentions}
      select "id" from project
    `)
  } catch (error) {
    if (isUniqueViolation(error, 'projects_slug_unique'))
      throw new InvalidRecordError(`project "${nextSlug}" exists already`, {
        field: 'slug',
      })
    if (isUniqueViolation(error, 'concepts_project_id_slug_unique'))
      throw new InvalidRecordError(
        `concept "${nextSlug}" exists already in the Project`,
        { field: 'slug' },
      )
    throw error
  }
  return { slug: nextSlug, name: nextName }
}

// The slugs of the Projects with the repository. Two or more share it:
// there, a build names a Decision as `<project>/<id>` (glue/D50).
export async function listRepositoryProjects(
  db: ConceptDb,
  repository: string,
): Promise<string[]> {
  const found = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.repository, repository))
    .orderBy(projects.slug)
  return found.map(({ slug }) => slug)
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

// The address of the help desk of the Product. null removes it: the Product
// has no Signals from support.
export async function setSupportUrl(
  db: ConceptDb,
  productSlug: string,
  supportUrl: string | null,
): Promise<void> {
  if (supportUrl !== null && !URL.canParse(supportUrl)) {
    throw new InvalidRecordError(`support "${supportUrl}" must be a URL`)
  }
  const updated = await db
    .update(projects)
    .set({ supportUrl })
    .where(eq(projects.slug, productSlug))
    .returning({ id: projects.id })
  if (updated.length === 0) throw new ProductNotFoundError(productSlug)
}

// The address of the market analysis of the Product. null removes it: the
// Product has no Signals from the market.
export async function setMarketUrl(
  db: ConceptDb,
  productSlug: string,
  marketUrl: string | null,
): Promise<void> {
  if (marketUrl !== null && !URL.canParse(marketUrl)) {
    throw new InvalidRecordError(`market "${marketUrl}" must be a URL`)
  }
  const updated = await db
    .update(projects)
    .set({ marketUrl })
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
