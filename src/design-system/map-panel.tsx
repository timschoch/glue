import { Close } from '@carbon/icons-react'
import { IconButton, Link } from '@carbon/react'
import { useEffect } from 'react'
import type { MouseEvent, ReactNode } from 'react'

import styles from './map-panel.module.scss'

export type MapPanelProps = {
  // The name of what the panel shows.
  name: string
  // The address of the full page.
  href: string
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void
  onClose: () => void
  children: ReactNode
}

// The panel beside the Map: one Concept or one record, with a link to its
// full page. Its close button and Escape close it.
export function MapPanel({
  name,
  href,
  onOpen,
  onClose,
  children,
}: MapPanelProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <aside aria-label={name} className={styles.panel}>
      <div className={styles.head}>
        <Link href={href} onClick={onOpen}>
          Open
        </Link>
        <IconButton
          kind="ghost"
          size="sm"
          align="bottom-end"
          label="Close"
          onClick={onClose}
        >
          <Close />
        </IconButton>
      </div>
      {children}
    </aside>
  )
}
