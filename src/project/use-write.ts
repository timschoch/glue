import { isRedirect, useRouter } from '@tanstack/react-router'
import { useCallback, useState } from 'react'

import { parseRedirect } from '../authentication/redirect.ts'
import type { Failure } from '../authentication/session.ts'

const UNAVAILABLE = 'This did not work. Check your connection, then try again.'

function isFailure(answer: unknown): answer is Failure {
  return typeof answer === 'object' && answer !== null && 'message' in answer
}

const start = Symbol('start')

// A write that did not start yet. The router context gives one for each
// write of the server. It is no promise: a screen cannot send it or wait for
// it. Only `useWrite` starts it, and `useWrite` says that the write runs and
// why it failed (glue-build/D55).
export type Write<TDone> = { readonly [start]: () => Promise<TDone> }

export function toWrite<TDone>(send: () => Promise<TDone>): Write<TDone> {
  return { [start]: send }
}

// For `useWrite` and for a test of the router context. A screen takes
// `useWrite`.
export function startWrite<TDone>(write: Write<TDone>): Promise<TDone> {
  return write[start]()
}

// The writes of a screen. One write runs at a time: `pending` names it and
// `failure` says why the last one did not happen, and `failurePlace` at
// which field of the form, when the server names one. After a write that
// worked, `onDone` opens the next screen, then each screen loads again.
// `unavailable` says that the server gave no answer. `clearFailure` forgets
// the failure: the form stopped the next write and shows its own reason.
export function useWrite(unavailable = UNAVAILABLE) {
  const router = useRouter()
  const [pending, setPending] = useState<string>()
  const [failure, setFailure] = useState<Failure>()

  const write = useCallback(
    async <TDone>(
      name: string,
      run: () => Write<TDone | Failure>,
      onDone?: (done: TDone) => Promise<void>,
    ) => {
      setPending(name)
      setFailure(undefined)
      try {
        const answer = await startWrite(run())
        if (isFailure(answer)) {
          setFailure(answer)
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
        setFailure({ message: unavailable })
      } finally {
        setPending(undefined)
      }
    },
    [router, unavailable],
  )

  const clearFailure = useCallback(() => setFailure(undefined), [])

  return {
    pending,
    failure: failure?.message,
    failurePlace: failure?.place,
    clearFailure,
    write,
  }
}
