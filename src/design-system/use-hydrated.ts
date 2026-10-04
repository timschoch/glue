import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

// False on the server and in the first render of the browser, which must
// match the HTML of the server. True from then on.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
