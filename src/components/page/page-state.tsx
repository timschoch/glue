import { Button, Title } from '@mantine/core'
import { Link, useRouter } from '@tanstack/react-router'

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

function MissingState({ title, text }: { title: string; text: string }) {
  return (
    <div className={classes.state}>
      <Title order={1} className={classes.title}>
        {title}
      </Title>
      <p className={classes.text}>{text}</p>
      <Link to="/">Go to the Concept</Link>
    </div>
  )
}

export function MissingRecordState({ recordId }: { recordId: string }) {
  return (
    <MissingState
      title={`No record ${recordId}`}
      text="The Concept has no record with this id. The id of a record is a letter and a number, such as D5."
    />
  )
}

export function MissingPageState() {
  return (
    <MissingState
      title="No page at this address"
      text="Check the address for a typing error, or start at the Concept."
    />
  )
}
