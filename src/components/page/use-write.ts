import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import type { Failure } from '../../authentication/session.ts'

function isFailure(answer: object | undefined): answer is Failure {
  return answer !== undefined && 'message' in answer
}

// A write from a page. It gives the failure to the form or the button that
// shows it. After a write that worked, the page loads again and shows the
// new state, unless `onDone` says what to do.
// When the session ended, the server function answers with a redirect:
// `useServerFn` goes to sign-in, and the answer is empty.
export function useWrite<TInput, TAnswer extends object | undefined>(
  write: (input: TInput) => Promise<TAnswer>,
  onDone?: (answer: Exclude<TAnswer, Failure> | undefined) => Promise<void>,
) {
  const router = useRouter()
  const run: (input: TInput) => Promise<TAnswer | undefined> =
    useServerFn(write)

  return async (input: TInput): Promise<Failure | undefined> => {
    const answer = await run(input)
    if (isFailure(answer)) return answer

    if (onDone) await onDone(answer as Exclude<TAnswer, Failure> | undefined)
    else await router.invalidate()
    return undefined
  }
}
