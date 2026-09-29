import { isRecordId } from '../db/record-id.ts'

const recordPath = '/concept/'

// The page to show after sign-in. Only a path of Glue itself is a target,
// so a link to sign-in can never send a person to another site.
export function parseRedirect(input: unknown): string | undefined {
  if (typeof input !== 'string' || !input.startsWith(recordPath)) {
    return undefined
  }
  return isRecordId(input.slice(recordPath.length)) ? input : undefined
}

// Without a target, the overview.
export function toDestination(target: string | undefined) {
  return target === undefined
    ? ({ to: '/' } as const)
    : ({
        to: '/concept/$recordId',
        params: { recordId: target.slice(recordPath.length) },
      } as const)
}
