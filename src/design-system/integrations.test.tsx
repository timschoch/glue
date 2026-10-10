// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { IntegrationForm, Integrations } from './integrations.tsx'
import type { IntegrationsProps } from './integrations.tsx'

afterEach(cleanup)

const INTEGRATIONS: IntegrationsProps['integrations'] = [
  {
    id: 1,
    tool: 'github',
    address: 'acme/shop',
    keyLastFour: '1234',
    state: 'active',
  },
  {
    id: 2,
    tool: 'github',
    address: 'acme/web',
    keyLastFour: 'wxyz',
    state: 'paused',
  },
  {
    id: 3,
    tool: 'github',
    address: 'acme/app',
    keyLastFour: '9876',
    state: 'failed',
    error: 'GitHub refused the key',
  },
]

const listRows = () =>
  within(screen.getByRole('list', { name: 'Integrations' }))
    .getAllByRole('listitem')
    .map((row) => row.textContent)

describe('Integrations', () => {
  it('lists each Integration with its tool, its address, the end of its key and its state', () => {
    render(<Integrations integrations={INTEGRATIONS} onClose={() => {}} />)

    expect(listRows()).toEqual([
      'GitHubacme/shop••••1234Active',
      'GitHubacme/web••••wxyzPaused',
      'GitHubacme/app••••9876FailedGitHub refused the key',
    ])
    expect(screen.queryByRole('button', { name: /Pause|Start|Remove/ })).toBe(
      null,
    )
  })

  it('pauses an active one, starts a paused or failed one, and removes each one', async () => {
    const user = userEvent.setup()
    const onPause = vi.fn()
    const onStart = vi.fn()
    const onRemove = vi.fn()
    render(
      <Integrations
        integrations={INTEGRATIONS}
        onPause={onPause}
        onStart={onStart}
        onRemove={onRemove}
        onClose={() => {}}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: 'Pause GitHub acme/shop' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Start GitHub acme/web' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Start GitHub acme/app' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Remove GitHub acme/web' }),
    )

    expect(onPause.mock.calls).toEqual([[1]])
    expect(onStart.mock.calls).toEqual([[2], [3]])
    expect(onRemove.mock.calls).toEqual([[2]])
  })

  it('shows at its row that a write runs, and takes no second write', () => {
    render(
      <Integrations
        integrations={INTEGRATIONS}
        change={{ id: 2, pending: 'Starting' }}
        onPause={() => {}}
        onStart={() => {}}
        onRemove={() => {}}
        onClose={() => {}}
      />,
    )

    const [, row] = screen.getAllByRole('listitem')
    expect(within(row).getByText('Starting')).toBeDefined()
    expect(within(row).queryByRole('button')).toBe(null)
    expect(
      screen
        .getAllByRole('button', { name: /Pause|Start|Remove/ })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true)
  })

  it('says at its row why a write failed', () => {
    render(
      <Integrations
        integrations={INTEGRATIONS}
        change={{ id: 2, failure: 'GitHub refused the key' }}
        onStart={() => {}}
        onClose={() => {}}
      />,
    )

    const [, row] = screen.getAllByRole('listitem')
    expect(within(row).getByText('GitHub refused the key')).toBeDefined()
  })

  it('goes back to the Signals', async () => {
    const onClose = vi.fn()
    render(<Integrations integrations={[]} onClose={onClose} />)

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Signals' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole('list')).toBe(null)
  })
})

describe('IntegrationForm', () => {
  it('adds the tool, the address and the key, without the spaces around them', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<IntegrationForm tools={['github']} onAdd={onAdd} />)
    const add = screen.getByRole('button', { name: 'Add integration' })

    expect((add as HTMLButtonElement).disabled).toBe(true)
    await user.type(screen.getByLabelText('Address'), ' acme/shop ')
    await user.type(screen.getByLabelText('Key'), ' key-of-the-team ')
    await user.click(add)

    expect(onAdd.mock.calls).toEqual([
      [{ tool: 'github', address: 'acme/shop', key: 'key-of-the-team' }],
    ])
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', { name: 'Tool' })
        .selectedOptions[0].textContent,
    ).toBe('GitHub')
  })

  it('never shows the key as text', () => {
    render(<IntegrationForm tools={['github']} onAdd={() => {}} />)

    expect(screen.getByLabelText('Key').getAttribute('type')).toBe('password')
  })

  it('says at the control why the server refused the address or the key', () => {
    render(
      <IntegrationForm
        tools={['github']}
        errors={{ key: 'GitHub refused the key' }}
        onAdd={() => {}}
      />,
    )

    expect(screen.getByLabelText('Key').getAttribute('aria-invalid')).toBe(
      'true',
    )
    expect(screen.getByText('GitHub refused the key')).toBeDefined()
    expect(
      screen.getByLabelText('Address').getAttribute('aria-invalid'),
    ).not.toBe('true')
  })

  it('shows that the write runs in the place of its button, and another reason under the fields', () => {
    render(
      <IntegrationForm
        tools={['github']}
        pending="Adding"
        serverError="This server cannot store a key."
        onAdd={() => {}}
      />,
    )

    expect(screen.getByText('Adding')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Add integration' })).toBe(null)
    expect(screen.getByText('This server cannot store a key.')).toBeDefined()
  })
})
