// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import './theme.scss'
import { PageState } from './page-state.tsx'

// The colour of the page title, as the style writes it.
const TEXT_PRIMARY = 'var(--cds-text-primary, #161616)'

afterEach(cleanup)

describe('PageState', () => {
  it('says what the main window has in place of a page, as the page title', () => {
    render(<PageState title="No record D9" />)

    const title = screen.getByRole('heading', { level: 1 })

    expect(title.textContent).toBe('No record D9')
    expect(getComputedStyle(title).color).toBe(TEXT_PRIMARY)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows the one link that leads on', () => {
    render(
      <PageState title="No Project nope" link={{ name: 'Glue', href: '/' }} />,
    )

    const link = screen.getByRole('link', { name: 'Glue' })

    expect(link.getAttribute('href')).toBe('/')
  })
})
