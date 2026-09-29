import { createServerFn } from '@tanstack/react-start'

import { sessionMiddleware } from '../authentication/session.functions.ts'
import { getSetting } from '../settings.server.ts'
import { createDb } from './client.ts'
import { findConcept, findRecord } from './concept.ts'
import { isRecordId } from './record-id.ts'

// Glue shows the Concept of one Product.
const productSlug = 'glue'

function parseRecordId(input: unknown): string {
  if (typeof input !== 'string' || !isRecordId(input)) {
    throw new Error('This is not the id of a record.')
  }
  return input
}

export const fetchConcept = createServerFn({ method: 'GET' })
  .middleware([sessionMiddleware])
  .handler(() => findConcept(createDb(getSetting('DATABASE_URL')), productSlug))

export const fetchRecord = createServerFn({ method: 'GET' })
  .middleware([sessionMiddleware])
  .validator(parseRecordId)
  .handler(({ data }) =>
    findRecord(createDb(getSetting('DATABASE_URL')), productSlug, data),
  )
