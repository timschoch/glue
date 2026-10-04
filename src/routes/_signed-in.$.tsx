import { createFileRoute } from '@tanstack/react-router'

import { PlainFrame } from '../design-system/frame.tsx'
import { PageState } from '../design-system/page-state.tsx'

// An address that is no Project, no Concept and no record.
export const Route = createFileRoute('/_signed-in/$')({
  head: () => ({ meta: [{ title: 'No page at this address | Glue' }] }),
  component: () => (
    <PlainFrame>
      <PageState
        title="No page at this address"
        link={{ name: 'Glue', href: '/' }}
      />
    </PlainFrame>
  ),
})
