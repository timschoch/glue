import { Button, NativeSelect } from '@mantine/core'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactNode } from 'react'

import type { User } from '../../authentication/session.ts'
import type { Product } from '../../db/concept.ts'
import { Announcer } from './announcer.tsx'
import classes from './page-frame.module.css'

type SignOut = 'idle' | 'pending' | 'failed'

// The frame of a page without a session: sign-in, sign-up, and a page that did not load.
export function PlainFrame({ children }: { children: ReactNode }) {
  return <main className={classes.plain}>{children}</main>
}

// Shows the Product of the page and goes to the overview of another one.
function ProductSwitch({ products }: { products: ReadonlyArray<Product> }) {
  const { product } = useParams({ strict: false })
  const navigate = useNavigate()
  const known = products.some(({ slug }) => slug === product)

  return (
    <NativeSelect
      aria-label="Product"
      classNames={{ root: classes.switch, input: classes.product }}
      value={known ? product : ''}
      onChange={(event) =>
        navigate({
          to: '/$product',
          params: { product: event.currentTarget.value },
        })
      }
    >
      {!known && (
        <option value="" disabled>
          Pick a Product
        </option>
      )}
      {products.map(({ slug, name }) => (
        <option key={slug} value={slug}>
          {name}
        </option>
      ))}
    </NativeSelect>
  )
}

// The frame of each page that needs a session.
export function PageFrame({
  user,
  products,
  onSignOut,
  children,
}: {
  user: User
  products: ReadonlyArray<Product>
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
          <div className={classes.place}>
            <Link to="/" className={classes.app}>
              Glue
            </Link>
            <ProductSwitch products={products} />
          </div>
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
        <Announcer>{children}</Announcer>
      </main>
    </>
  )
}
