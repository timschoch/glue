import { ColorSchemeScript, MantineProvider } from '@mantine/core'
import { Outlet, createFileRoute } from '@tanstack/react-router'

import mantineCss from '@mantine/core/styles.css?url'
import appCss from '../styles.css?url'
import { cssVariablesResolver, theme } from '../theme'

// The screens that are not on Carbon yet. Their styles and their provider
// load for these screens only.
export const Route = createFileRoute('/_mantine')({
  head: () => ({
    links: [
      { rel: 'stylesheet', href: mantineCss },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  component: () => (
    <>
      <ColorSchemeScript />
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
      >
        <Outlet />
      </MantineProvider>
    </>
  ),
})
