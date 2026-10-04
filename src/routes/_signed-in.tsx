import { createFileRoute } from '@tanstack/react-router'

import { PlainFrame } from '../design-system/frame.tsx'
import carbonCss from '../design-system/theme.scss?url'
import { LoadError } from '../project/load-error.tsx'
import { requireSession } from '../router-context.ts'

// Each Carbon screen is below this route, and each one needs a session. The
// route reads the Projects once, for the Project switcher. When the network
// fails later, the frame stays and the page in it shows the error.
export const Route = createFileRoute('/_signed-in')({
  beforeLoad: ({ context, location }) =>
    requireSession(context, location.pathname),
  loader: ({ context }) => context.fetchProjects(),
  staleTime: Infinity,
  head: () => ({ links: [{ rel: 'stylesheet', href: carbonCss }] }),
  errorComponent: () => (
    <PlainFrame>
      <LoadError name="Glue" />
    </PlainFrame>
  ),
})
