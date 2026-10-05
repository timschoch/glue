// @vitest-environment node
import { composeStories } from '@storybook/react-vite'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import * as mapStories from './concept-map.stories.tsx'
import * as credentialsStories from './credentials-form.stories.tsx'
import * as recordStories from './record.stories.tsx'

const { ProjectClosed } = composeStories(mapStories)
const { SignUp } = composeStories(credentialsStories)
const { InReview } = composeStories(recordStories)

// What the server sends, before the browser runs the page.
describe('the HTML from the server', () => {
  it('holds no Map: the browser loads React Flow and ELK and draws it', () => {
    const html = renderToString(<ProjectClosed />)

    expect(html).toMatch(/^<main class="[^"]*"><\/main>$/)
  })

  it('holds no menu of a record: the browser renders a closed menu as nothing', () => {
    const html = renderToString(<InReview />)

    expect(html).toContain('Sign off')
    expect(html).not.toContain('role="menu"')
  })

  it('takes no submit of the credentials: the browser would send the form itself and empty it', () => {
    const html = renderToString(<SignUp />)

    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>Make account/)
  })
})
