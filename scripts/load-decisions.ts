import type { ConceptDb } from '../src/db/client.ts'
import { listDecisionStatuses } from '../src/db/concept.ts'

export async function loadDecisions(db: ConceptDb, productSlug: string) {
  const rows = await listDecisionStatuses(db, productSlug)

  return new Map(
    rows.map((row) => [
      row.id,
      {
        status: row.status,
        superseded_by: row.supersededById ?? undefined,
      },
    ]),
  )
}
