import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'

import carbonCss from '../design-system/theme.scss?url'
import type { RouterContext } from '../router-context.ts'

// The document, with the stylesheet of the UI kit: each screen is on Carbon.
export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    links: [{ rel: 'stylesheet', href: carbonCss }],
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Glue',
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
