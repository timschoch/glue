import { z } from 'zod'

import { InvalidRecordError } from './record-errors.ts'

// What the inputs of the write side share.

export const text = z.string().trim().min(1)

export const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
  error: 'a slug is lowercase words joined by hyphens',
})

// Reads the input with the schema. What breaks a rule is refused with the
// same error as a record that breaks a rule.
export function parseInput<TOutput>(
  inputSchema: z.ZodType<TOutput>,
  input: unknown,
) {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success)
    throw new InvalidRecordError(z.prettifyError(parsed.error))
  return parsed.data
}
