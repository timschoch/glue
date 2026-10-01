// The pages that can be a target: the overview of a Product and a record.
const targetPattern = /^\/([\w-]+)(?:\/concept\/([GDIFR]\d+))?$/

// The page to show after sign-in. Only a path of Glue itself is a target,
// so a link to sign-in can never send a person to another site.
export function parseRedirect(input: unknown): string | undefined {
  return typeof input === 'string' && targetPattern.test(input)
    ? input
    : undefined
}

// Without a target, the overview.
export function toDestination(target: string | undefined) {
  const found = targetPattern.exec(target ?? '')
  if (!found) return { to: '/' } as const
  const [, product, recordId] = found
  return recordId
    ? ({
        to: '/$product/concept/$recordId',
        params: { product, recordId },
      } as const)
    : ({ to: '/$product', params: { product } } as const)
}
