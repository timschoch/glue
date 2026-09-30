import { VisuallyHidden } from '@mantine/core'
import { createContext, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type Announcement = {
  // Says the result of an action to a screen reader and moves the focus to
  // the element with the id. The button of the action is gone after it, and
  // without this the focus falls to the start of the page.
  announce: (message: string, focusId: string) => void
  // The ref of an element that can get the focus. An element that comes to
  // the page after the action takes the focus then.
  claimFocus: (element: HTMLElement | null) => void
}

const AnnouncerContext = createContext<Announcement>({
  announce: () => {},
  claimFocus: () => {},
})

export function useAnnouncer() {
  return useContext(AnnouncerContext)
}

// One polite live region for the page. It is on the page before the first
// message, so a screen reader reads each message.
export function Announcer({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  const waitingId = useRef<string>(undefined)

  const announcement = useMemo<Announcement>(
    () => ({
      announce(text, focusId) {
        setMessage(text)
        const target = document.getElementById(focusId)
        if (target) target.focus()
        else waitingId.current = focusId
      },
      claimFocus(element) {
        if (!element || element.id !== waitingId.current) return
        waitingId.current = undefined
        element.focus()
      },
    }),
    [],
  )

  return (
    <AnnouncerContext value={announcement}>
      {children}
      <VisuallyHidden role="status">{message}</VisuallyHidden>
    </AnnouncerContext>
  )
}
