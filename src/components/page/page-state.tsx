import { Button, Title } from '@mantine/core'
import { Link, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import classes from './page-state.module.css'

export function LoadingState({ name }: { name: string }) {
  return (
    <p role="status" className={classes.loading}>
      Loading {name}
    </p>
  )
}

export function ErrorState({
  name,
  onRetry,
}: {
  name: string
  onRetry: () => void
}) {
  return (
    <div role="alert" className={classes.state}>
      <Title order={1}>Unable to load {name}</Title>
      <p className={classes.text}>Check your connection, then try again.</p>
      <Button onClick={onRetry} className={classes.action}>
        Try again
      </Button>
    </div>
  )
}

// For the errorComponent of a route: loads the route again.
export function RouteErrorState({ name }: { name: string }) {
  const router = useRouter()

  return <ErrorState name={name} onRetry={() => void router.invalidate()} />
}

function MissingState({
  title,
  text,
  children,
}: {
  title: string
  text: string
  children?: ReactNode
}) {
  return (
    <div className={classes.state}>
      <Title order={1} className={classes.title}>
        {title}
      </Title>
      <p className={classes.text}>{text}</p>
      {children}
    </div>
  )
}

export function MissingRecordState({ recordId }: { recordId: string }) {
  return (
    <MissingState
      title={`No record ${recordId}`}
      text="The Concept has no record with this id. The id of a record is a letter and a number, such as D5."
    >
      <Link from="/$project/decisions/new" to="/$project" params={true}>
        Go to the Concept
      </Link>
    </MissingState>
  )
}

export function MissingProductState({ product }: { product: string }) {
  return (
    <MissingState
      title={`No Product ${product}`}
      text="Check the address for a typing error, or pick a Product at the top of the page."
    />
  )
}

export function MissingPageState() {
  return (
    <MissingState
      title="No page at this address"
      text="Check the address for a typing error, or start at the Concept."
    >
      <Link to="/">Go to the Concept</Link>
    </MissingState>
  )
}
