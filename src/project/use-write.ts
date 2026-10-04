import { isRedirect, useRouter } from '@tanstack/react-router'
import { useCallback, useState } from 'react'

import { parseRedirect } from '../authentication/redirect.ts'
import type { Failure } from '../authentication/session.ts'

const UNAVAILABLE = 'This did not work. Check your connection, then try again.'

function isFailure(answer: unknown): answer is Failure {
  return typeof answer === 'object' && answer !== null && 'message' in answer
}

// The writes of a screen. One write runs at a time: `pending` names it and
// `failure` says why the last one did not happen. After a write that
// worked, `onDone` opens the next screen, then each screen loads again.
export function useWrite() {
  const router = useRouter()
  const [pending, setPending] = useState<string>()
  const [failure, setFailure] = useState<string>()

  const write = useCallback(
    async <TDone>(
      name: string,
      run: () => Promise<TDone | Failure>,
      onDone?: (done: TDone) => Promise<void>,
    ) => {
      setPending(name)
      setFailure(undefined)
      try {
        const answer = await run()
        if (isFailure(answer)) {
          setFailure(answer.message)
          return
        }
        await onDone?.(answer)
        await router.invalidate()
      } catch (error) {
        // The session ended: the server function answers with a redirect.
        // The person comes back to this screen after sign-in.
        if (isRedirect(error)) {
          await router.navigate({
            to: '/sign-in',
            search: { redirect: parseRedirect(router.state.location.pathname) },
          })
          return
        }
        setFailure(UNAVAILABLE)
      } finally {
        setPending(undefined)
      }
    },
    [router],
  )

  return { pending, failure, write }
}
