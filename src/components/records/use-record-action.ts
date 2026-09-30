import { useState } from 'react'

import type { Failure } from '../../authentication/session.ts'

export type RecordAction = () => Promise<Failure | undefined>

// The state of the actions on one record: which action runs, and why the
// last one did not work.
export function useRecordAction() {
  const [pending, setPending] = useState<string>()
  const [failure, setFailure] = useState<string>()

  async function run(name: string, action: RecordAction) {
    setPending(name)
    setFailure(undefined)
    try {
      const failed = await action()
      if (failed) setFailure(failed.message)
    } catch {
      setFailure('This did not work. Check your connection, then try again.')
    } finally {
      setPending(undefined)
    }
  }

  return { pending, failure, run }
}
