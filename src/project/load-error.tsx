import { useLocation } from '@tanstack/react-router'

import { PageState } from '../design-system/page-state.tsx'

// For the errorComponent of a route. The link loads the address again.
export function LoadError({ name }: { name: string }) {
  const { href } = useLocation()

  return (
    <PageState
      title={`Unable to load ${name}`}
      link={{ name: 'Try again', href }}
    />
  )
}
