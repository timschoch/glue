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
    lastRead: { at: '2026-10-09T08:30:00.000Z', signalCount: 12, error: null },
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
    lastRead: {
      at: '2026-10-10T07:05:00.000Z',
      signalCount: null,
      error: 'GitHub refused the key',
    },
  },
]

// Carbon's dialog watches its size, which jsdom can not do.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
)

const listRows = () =>
  within(screen.getByRole('list', { name: 'Integrations' }))
    .getAllByRole('listitem')
    .map((row) => row.textContent)

describe('Integrations', () => {
  it('lists each Integration with its tool, its address, the end of its key, its state and its last read', () => {
    render(<Integrations integrations={INTEGRATIONS} onClose={() => {}} />)

    expect(listRows()).toEqual([
      'GitHubacme/shop••••1234Active2026-10-09 08:3012 Signals',
      'GitHubacme/web••••wxyzPaused',
      'GitHubacme/app••••9876Failed2026-10-10 07:05GitHub refused the key',
    ])
    expect(screen.getByText('2026-10-09 08:30').getAttribute('datetime')).toBe(
      '2026-10-09T08:30:00.000Z',
    )
    expect(screen.queryByRole('button', { name: /Pause|Start|Remove/ })).toBe(
      null,
    )
  })

  it('shows the error of a read that failed at an Integration that is still active, and one Signal as one', () => {
    render(
      <Integrations
        integrations={[
          {
            ...INTEGRATIONS[0],
            lastRead: {
              at: '2026-10-10T07:05:00.000Z',
              signalCount: null,
              error: 'GitHub limits the reads with this key for now.',
            },
          },
          {
            ...INTEGRATIONS[1],
            lastRead: {
              at: '2026-10-10T07:05:00.000Z',
              signalCount: 1,
              error: null,
            },
          },
        ]}
        onClose={() => {}}
      />,
    )

    expect(listRows()).toEqual([
      'GitHubacme/shop••••1234Active2026-10-10 07:05GitHub limits the reads with this key for now.',
      'GitHubacme/web••••wxyzPaused2026-10-10 07:051 Signal',
    ])
  })

  it('pauses an active one and starts a paused or failed one', async () => {
    const user = userEvent.setup()
    const onPause = vi.fn()
    const onStart = vi.fn()
    render(
      <Integrations
        integrations={INTEGRATIONS}
        onPause={onPause}
        onStart={onStart}
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

    expect(onPause.mock.calls).toEqual([[1]])
    expect(onStart.mock.calls).toEqual([[2], [3]])
  })

  it('asks one time before it removes an Integration, and removes it on the button of the dialog', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(
      <Integrations
        integrations={INTEGRATIONS}
        onRemove={onRemove}
        onClose={() => {}}
      />,
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(
      screen.getByRole('button', { name: 'Remove GitHub acme/web' }),
    )
    expect(onRemove).not.toHaveBeenCalled()
    await user.click(
      within(
        screen.getByRole('dialog', { name: 'Remove GitHub acme/web?' }),
      ).getByRole('button', { name: 'Remove' }),
    )

    expect(onRemove.mock.calls).toEqual([[2]])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes the dialog on Cancel and keeps the Integration', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(
      <Integrations
        integrations={INTEGRATIONS}
        onRemove={onRemove}
        onClose={() => {}}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: 'Remove GitHub acme/web' }),
    )
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    )

    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the form for a new key at the row, and gives the key without the spaces around it', async () => {
    const user = userEvent.setup()
    const onEditKey = vi.fn()
    const onSetKey = vi.fn()
    const { rerender } = render(
      <Integrations
        integrations={INTEGRATIONS}
        onEditKey={onEditKey}
        onSetKey={onSetKey}
        onClose={() => {}}
      />,
    )

    expect(screen.queryByLabelText('New key')).toBeNull()
    await user.click(
      screen.getByRole('button', { name: 'New key GitHub acme/web' }),
    )
    expect(onEditKey.mock.calls).toEqual([[2]])

    rerender(
      <Integrations
        integrations={INTEGRATIONS}
        keyOf={2}
        onEditKey={onEditKey}
        onSetKey={onSetKey}
        onClose={() => {}}
      />,
    )
    const [, row] = screen.getAllByRole('listitem')
    const key = within(row).getByLabelText('New key')
    const save = within(row).getByRole('button', { name: 'Save key' })

    expect(key.getAttribute('type')).toBe('password')
    expect((save as HTMLButtonElement).disabled).toBe(true)
    await user.type(key, ' new-key-of-the-team ')
    await user.click(save)
    await user.click(within(row).getByRole('button', { name: 'Cancel' }))

    expect(onSetKey.mock.calls).toEqual([[2, 'new-key-of-the-team']])
    expect(onEditKey.mock.calls).toEqual([[2], []])
  })

  it('shows in the form of the new key that the write runs, and at the key why the server refused it', () => {
    const { rerender } = render(
      <Integrations
        integrations={INTEGRATIONS}
        keyOf={2}
        change={{ id: 2, pending: 'Saving' }}
        onEditKey={() => {}}
        onSetKey={() => {}}
        onClose={() => {}}
      />,
    )
    const [, row] = screen.getAllByRole('listitem')

    expect(within(row).getByText('Saving')).toBeDefined()
    expect(within(row).queryByRole('button', { name: 'Save key' })).toBeNull()

    rerender(
      <Integrations
        integrations={INTEGRATIONS}
        keyOf={2}
        change={{ id: 2, failure: 'GitHub refused the key', field: 'key' }}
        onEditKey={() => {}}
        onSetKey={() => {}}
        onClose={() => {}}
      />,
    )

    expect(
      within(row).getByLabelText('New key').getAttribute('aria-invalid'),
    ).toBe('true')
    expect(within(row).getByText('GitHub refused the key')).toBeDefined()
    expect(within(row).queryByRole('alert')).toBeNull()
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
