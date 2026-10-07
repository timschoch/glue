// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { ContractQuestions } from './contract-questions.tsx'
import type { ContractQuestionRow } from './contract-questions.tsx'

const OPEN: ContractQuestionRow = {
  id: 2,
  version: 2,
  stale: false,
  text: 'Does a Technique need a video?',
  askedBy: 'build-agent',
  askedAt: '2026-10-03T09:00:00.000Z',
  answer: null,
}

const ANSWERED: ContractQuestionRow = {
  id: 1,
  version: 1,
  stale: true,
  text: 'How long is a video?',
  askedBy: 'Fred',
  askedAt: '2026-10-01T09:00:00.000Z',
  answer: {
    text: 'At most 30 seconds.',
    by: 'Mara',
    at: '2026-10-02T09:00:00.000Z',
  },
}

// Carbon's text area watches its size, which jsdom can not do.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
)

afterEach(cleanup)

function row(text: string): HTMLElement {
  const item = screen
    .getAllByRole('listitem')
    .find((listed) => listed.textContent.includes(text))
  if (!item) throw new Error(`No question ${text}`)
  return item
}

describe('ContractQuestions', () => {
  it('marks only the question about an old Version as stale', () => {
    render(<ContractQuestions questions={[OPEN, ANSWERED]} />)

    expect(within(row(OPEN.text)).queryByText('Stale')).toBeNull()
    within(row(ANSWERED.text)).getByText('Stale')
    within(row(ANSWERED.text)).getByText('Version 1')
  })

  it('gives the field of an answer to an open question only', () => {
    render(
      <ContractQuestions questions={[OPEN, ANSWERED]} onAnswer={vi.fn()} />,
    )

    within(row(OPEN.text)).getByRole('button', { name: 'Answer' })
    expect(within(row(ANSWERED.text)).queryByRole('button')).toBeNull()
  })

  it('sends no empty question, and names the reason at the field', async () => {
    const onAsk = vi.fn()
    render(<ContractQuestions questions={[]} onAsk={onAsk} />)

    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    screen.getByText('Enter a question.')
    expect(onAsk).not.toHaveBeenCalled()

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Question' }),
      ' Who owns it? ',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(onAsk).toHaveBeenCalledWith('Who owns it?')
  })

  it('shows the write that runs at the field of its question, in place of the button', async () => {
    const view = render(
      <ContractQuestions questions={[OPEN]} onAnswer={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Answer' }))

    view.rerender(
      <ContractQuestions
        questions={[OPEN]}
        onAnswer={vi.fn()}
        write={{ at: OPEN.id, pending: 'Saving' }}
      />,
    )

    within(row(OPEN.text)).getByText('Saving')
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('is left out with no question and no way to ask', () => {
    render(<ContractQuestions questions={[]} />)

    expect(screen.queryByRole('region', { name: 'Questions' })).toBeNull()
  })
})
