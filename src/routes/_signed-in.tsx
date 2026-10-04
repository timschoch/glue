import { createFileRoute } from '@tanstack/react-router'

import { PlainFrame } from '../design-system/frame.tsx'
import { PageSkeleton } from '../design-system/page-state.tsx'
import { LoadError } from '../project/load-error.tsx'
import { requireSession } from '../router-context.ts'

// Each screen of a Project is below this route, and each one needs a
// session. The route reads the Projects once, for the Project switcher. A
// new Project makes it read them again. When the network fails later, the
// frame stays and the page in it shows the error.
export const Route = createFileRoute('/_signed-in')({
  beforeLoad: ({ context, location }) =>
    requireSession(context, location.pathname),
  loader: ({ context }) => context.fetchProjects(),
  staleTime: Infinity,
  pendingComponent: () => (
    <PlainFrame>
      <PageSkeleton />
    </PlainFrame>
  ),
  errorComponent: () => (
    <PlainFrame>
      <LoadError name="Glue" />
    </PlainFrame>
  ),
})
