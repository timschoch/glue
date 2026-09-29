import { Button } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactNode } from 'react'

import type { User } from '../../authentication/session.ts'
import classes from './page-frame.module.css'

type SignOut = 'idle' | 'pending' | 'failed'

// The frame of a page without a session: sign-in, sign-up, and a page that did not load.
export function PlainFrame({ children }: { children: ReactNode }) {
  return <main className={classes.plain}>{children}</main>
}

// The frame of each page that needs a session.
export function PageFrame({
  user,
  onSignOut,
  children,
}: {
  user: User
  onSignOut: () => Promise<void>
  children: ReactNode
}) {
  const [signOut, setSignOut] = useState<SignOut>('idle')

  async function handleSignOut() {
    setSignOut('pending')
    try {
      await onSignOut()
      setSignOut('idle')
    } catch {
      setSignOut('failed')
    }
  }

  return (
    <>
      <a href="#content" className={classes.skip}>
        Skip to the content
      </a>
      <header className={classes.header}>
        <div className={classes.bar}>
          <Link to="/" className={classes.product}>
            Glue
          </Link>
          <div className={classes.account}>
            <span className={classes.user}>{user.name}</span>
            <Button
              variant="default"
              size="xs"
              disabled={signOut === 'pending'}
              onClick={handleSignOut}
            >
              {signOut === 'pending' ? 'Signing out' : 'Sign out'}
            </Button>
          </div>
        </div>
        <div role="alert" className={classes.failure}>
          {signOut === 'failed' && 'Sign-out did not work. Try again.'}
        </div>
      </header>
      <main id="content" tabIndex={-1} className={classes.content}>
        {children}
      </main>
    </>
  )
}
