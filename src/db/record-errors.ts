import type { FailurePlace } from '../authentication/session.ts'
import { typeOfRecordId } from './record-id.ts'

// A record breaks a rule: a missing field, or a link to a record that does
// not exist. The HTTP API answers it with 400. `place` is the field that
// breaks the rule, when one field does.
export class InvalidRecordError extends Error {
  constructor(
    message: string,
    readonly place?: FailurePlace,
  ) {
    super(message)
  }
}

// The Product of the request does not exist. The HTTP API answers it with 404.
export class ProductNotFoundError extends InvalidRecordError {
  constructor(productSlug: string) {
    super(`product "${productSlug}" not found`)
  }
}

// The letter of a record id names the type, so the message names it too.
export function toNotFoundMessage(recordId: string) {
  const type = typeOfRecordId(recordId)
  return type ? `${type} "${recordId}" not found` : `"${recordId}" not found`
}

// The Part that the request reads or writes does not exist. The HTTP API
// answers it with 404. A Part that a write links to and that does not exist
// is an InvalidRecordError with the same message.
export class PartNotFoundError extends InvalidRecordError {
  constructor(readonly recordId: string) {
    super(toNotFoundMessage(recordId))
  }
}

// The Concept of the request does not exist. The HTTP API answers it with 404.
export class ConceptNotFoundError extends InvalidRecordError {
  constructor(conceptSlug: string) {
    super(`concept "${conceptSlug}" not found`)
  }
}

// The saved filter of the request does not exist. The HTTP API answers it
// with 404.
export class SignalFilterNotFoundError extends InvalidRecordError {
  constructor(filterId: number | string) {
    super(`filter ${filterId} not found`)
  }
}

// The Joint of the request does not exist. The HTTP API answers it with 404.
export class JointNotFoundError extends InvalidRecordError {
  constructor(jointId: number) {
    super(`joint ${jointId} not found`)
  }
}

const UNIQUE_VIOLATION = '23505'

// The database refused a row that exists already: any unique rule, or the
// one of the name.
export function isUniqueViolation(error: unknown, constraint?: string) {
  const cause = error instanceof Error && error.cause ? error.cause : error
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === UNIQUE_VIOLATION &&
    (constraint === undefined ||
      ('constraint' in cause && cause.constraint === constraint))
  )
}
