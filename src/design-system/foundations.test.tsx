// @vitest-environment jsdom
import { composeStories } from '@storybook/react-vite'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import * as stories from './foundations.stories.tsx'

const { TypeScale } = composeStories(stories)

afterEach(cleanup)

describe('Foundations', () => {
  it('names the main window as the place of a record title', () => {
    render(<TypeScale />)

    expect(screen.getByText('Record title in the main window')).toBeDefined()
    expect(screen.queryByText(/detail panel/)).toBeNull()
  })
})
