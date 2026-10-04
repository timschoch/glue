// A record breaks a rule: a missing field, or a link to a record that does
// not exist. The HTTP API answers it with 400.
export class InvalidRecordError extends Error {}

// The Product of the request does not exist. The HTTP API answers it with 404.
export class ProductNotFoundError extends InvalidRecordError {
  constructor(productSlug: string) {
    super(`product "${productSlug}" not found`)
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
