import { alias } from 'drizzle-orm/pg-core'
import { eq } from 'drizzle-orm'

import type { ConceptDb } from '../src/db/import-concept.ts'
import * as schema from '../src/db/schema.ts'

export async function loadDecisions(db: ConceptDb, productSlug: string) {
  const supersededBy = alias(schema.decisions, 'superseded_by')
  const rows = await db
    .select({
      recordId: schema.decisions.recordId,
      status: schema.decisions.status,
      supersededByRecordId: supersededBy.recordId,
    })
    .from(schema.decisions)
    .innerJoin(
      schema.products,
      eq(schema.decisions.productId, schema.products.id),
    )
    .leftJoin(
      supersededBy,
      eq(supersededBy.id, schema.decisions.supersededById),
    )
    .where(eq(schema.products.slug, productSlug))

  return new Map(
    rows.map((row) => [
      row.recordId,
      {
        status: row.status,
        superseded_by: row.supersededByRecordId ?? undefined,
      },
    ]),
  )
}
