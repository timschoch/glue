import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import type { Failure } from '../../authentication/session.ts'

function isFailure(answer: unknown): answer is Failure {
  return typeof answer === 'object' && answer !== null && 'message' in answer
}

// A write from a page. It gives the failure to the form or the button that
// shows it. After a write that worked, the page loads again and shows the
// new state, unless `onDone` says what to do.
// When the session ended, the server function answers with a redirect:
// `useServerFn` goes to sign-in, and the answer is empty.
export function useWrite<TInput, TDone>(
  write: (input: TInput) => Promise<TDone | Failure>,
  onDone?: (done: TDone | undefined) => Promise<void>,
) {
  const router = useRouter()
  const run: (input: TInput) => Promise<TDone | Failure | undefined> =
    useServerFn(write)

  return async (input: TInput): Promise<Failure | undefined> => {
    const answer = await run(input)
    if (isFailure(answer)) return answer

    if (onDone) await onDone(answer)
    else await router.invalidate()
    return undefined
  }
}
