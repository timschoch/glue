// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import './theme.scss'
import { StepBar } from './step-bar.tsx'

afterEach(cleanup)

const STEPS = ['Set Goal', 'Choose', 'Sign']

// The steps of the bar, each with the state that a screen reader hears.
function listSteps() {
  const bar = screen.getByRole('list', { name: 'Insight to Decision' })
  return within(bar)
    .getAllByRole('listitem')
    .map((step) => ({
      label: step.querySelector('[class$="progress-label"]')?.textContent,
      state: step.querySelector('[class$="assistive-text"]')?.textContent,
    }))
}

describe('the step bar', () => {
  it('shows the steps of the flow in order, with one current step', () => {
    render(<StepBar name="Insight to Decision" steps={STEPS} current={1} />)

    expect(listSteps()).toEqual([
      { label: 'Set Goal', state: 'Complete' },
      { label: 'Choose', state: 'Current' },
      { label: 'Sign', state: 'Incomplete' },
    ])
    expect(
      screen
        .getAllByRole('button')
        .filter((step) => step.getAttribute('aria-current') === 'step')
        .map((step) => step.title),
    ).toEqual(['Choose'])
  })

  it('shows a flow at its end with all steps done', () => {
    render(<StepBar name="Insight to Decision" steps={STEPS} current={3} />)

    expect(listSteps().map(({ state }) => state)).toEqual([
      'Complete',
      'Complete',
      'Complete',
    ])
  })
})
