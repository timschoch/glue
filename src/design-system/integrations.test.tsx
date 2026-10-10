// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import {
  IntegrationForm,
  IntegrationSecret,
  Integrations,
} from './integrations.tsx'
import type {
  IntegrationFormProps,
  IntegrationsProps,
} from './integrations.tsx'

// Carbon's code snippet watches its size, which jsdom can not do.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

afterEach(cleanup)

const INTEGRATIONS: IntegrationsProps['integrations'] = [
  {
    id: 1,
    tool: 'GitHub',
    address: 'acme/shop',
    keyLastFour: '1234',
    state: 'active',
    lastRead: { at: '2026-10-09T08:30:00.000Z', signalCount: 12, error: null },
  },
  {
    id: 2,
    tool: 'GitHub',
    address: 'acme/web',
    keyLastFour: 'wxyz',
    state: 'paused',
  },
  {
    id: 3,
    tool: 'GitHub',
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
        change={{ id: 2, pending: 'Saving', isKey: true }}
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
        change={{
          id: 2,
          failure: 'GitHub refused the key',
          field: 'key',
          isKey: true,
        }}
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

  it.each([
    ['closed', undefined],
    ['open', 2],
  ])(
    'says at its row why a start failed when the server refused the stored key, with the form of the new key %s',
    (_form, keyOf) => {
      render(
        <Integrations
          integrations={INTEGRATIONS}
          keyOf={keyOf}
          change={{ id: 2, failure: 'GitHub refused the key', field: 'key' }}
          onStart={() => {}}
          onEditKey={() => {}}
          onSetKey={() => {}}
          onClose={() => {}}
        />,
      )

      const [, row] = screen.getAllByRole('listitem')
      expect(
        within(within(row).getByRole('alert')).getByText(
          'GitHub refused the key',
        ),
      ).toBeDefined()
    },
  )

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

describe('IntegrationSecret', () => {
  it('shows the name, the URL and the whole secret of the new Integration, to read only', () => {
    render(
      <IntegrationSecret
        name="Webhook Helpdesk"
        address="https://glue.example.com/api/v1/projects/glue/webhook"
        secret="Zk3vQ1example-secret-not-real-9fLm2abcd-wxyz"
      />,
    )

    const group = within(
      screen.getByRole('group', { name: 'Webhook Helpdesk' }),
    )
    const address = group.getByRole('textbox', { name: 'URL' })
    const secret = group.getByRole('textbox', { name: 'Secret' })
    expect(group.getByRole('heading').textContent).toBe('Webhook Helpdesk')
    expect(address.textContent).toBe(
      'https://glue.example.com/api/v1/projects/glue/webhook',
    )
    expect(secret.textContent).toBe(
      'Zk3vQ1example-secret-not-real-9fLm2abcd-wxyz',
    )
    expect(
      [address, secret].map((value) => value.getAttribute('aria-readonly')),
    ).toEqual(['true', 'true'])
  })

  it('wraps the URL and the secret, so a narrow screen cuts neither', () => {
    render(
      <IntegrationSecret
        name="Webhook Helpdesk"
        address="https://glue.example.com/api/v1/projects/glue/webhook"
        secret="Zk3vQ1example-secret-not-real-9fLm2abcd-wxyz"
      />,
    )

    const wraps = ['URL', 'Secret'].map((name) => {
      const code = screen.getByRole('textbox', { name }).querySelector('pre')
      return code && getComputedStyle(code).whiteSpace
    })
    expect(wraps).toEqual(['pre-wrap', 'pre-wrap'])
  })
})

// What the adapters of the three tools ask of a member. The form knows no
// tool: it shows what it gets.
const GITHUB = {
  name: 'github',
  label: 'GitHub',
  addressFields: [{ label: 'Repository' }],
  needsKey: true,
}
const TOOLS: IntegrationFormProps['tools'] = [
  GITHUB,
  {
    name: 'posthog',
    label: 'PostHog',
    addressFields: [
      {
        label: 'Region',
        options: [
          { value: 'us', label: 'US' },
          { value: 'eu', label: 'EU' },
        ],
      },
      { label: 'Project ID' },
    ],
    needsKey: true,
  },
  {
    name: 'webhook',
    label: 'Webhook',
    addressFields: [{ label: 'Name' }],
    needsKey: false,
  },
]

describe('IntegrationForm', () => {
  it('adds the tool, the address and the key, without the spaces around them', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<IntegrationForm tools={[GITHUB]} onAdd={onAdd} />)
    const add = screen.getByRole('button', { name: 'Add integration' })

    expect((add as HTMLButtonElement).disabled).toBe(true)
    await user.type(screen.getByLabelText('Repository'), ' acme/shop ')
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
    render(<IntegrationForm tools={[GITHUB]} onAdd={() => {}} />)

    expect(screen.getByLabelText('Key').getAttribute('type')).toBe('password')
  })

  it('says at the control why the server refused the address or the key', () => {
    render(
      <IntegrationForm
        tools={[GITHUB]}
        errors={{ key: 'GitHub refused the key' }}
        onAdd={() => {}}
      />,
    )

    expect(screen.getByLabelText('Key').getAttribute('aria-invalid')).toBe(
      'true',
    )
    expect(screen.getByText('GitHub refused the key')).toBeDefined()
    expect(
      screen.getByLabelText('Repository').getAttribute('aria-invalid'),
    ).not.toBe('true')
  })

  it('shows the controls that a tool asks for, with no word of its own for a tool', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(
      <IntegrationForm
        tools={[
          GITHUB,
          {
            name: 'board',
            label: 'Idea board',
            addressFields: [
              { label: 'Workspace' },
              {
                label: 'Lane',
                options: [
                  { value: 'new', label: 'New ideas' },
                  { value: 'top', label: 'Top ideas' },
                ],
              },
              { label: 'Board' },
            ],
            needsKey: true,
          },
        ]}
        errors={{ address: 'The board is closed' }}
        onAdd={onAdd}
      />,
    )

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Tool' }),
      'Idea board',
    )
    await user.type(screen.getByLabelText('Workspace'), 'acme')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Lane' }),
      'Top ideas',
    )
    await user.type(screen.getByLabelText('Board'), '7')
    await user.type(screen.getByLabelText('Key'), 'key-of-the-team')
    await user.click(screen.getByRole('button', { name: 'Add integration' }))

    expect(screen.queryByLabelText('Repository')).toBe(null)
    expect(screen.getByLabelText('Board').getAttribute('aria-invalid')).toBe(
      'true',
    )
    expect(onAdd.mock.calls).toEqual([
      [{ tool: 'board', address: 'acme/top/7', key: 'key-of-the-team' }],
    ])
  })

  it('shows the controls of PostHog, and adds its region and its project as the address', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<IntegrationForm tools={TOOLS} onAdd={onAdd} />)

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Tool' }),
      'PostHog',
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Region' }),
      'EU',
    )
    await user.type(screen.getByLabelText('Project ID'), ' 12345 ')
    await user.type(screen.getByLabelText('Key'), 'key-of-the-team')
    await user.click(screen.getByRole('button', { name: 'Add integration' }))

    expect(screen.queryByLabelText('Repository')).toBe(null)
    expect(onAdd.mock.calls).toEqual([
      [{ tool: 'posthog', address: 'eu/12345', key: 'key-of-the-team' }],
    ])
  })

  it('shows only a name for a webhook, and adds it with no key', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<IntegrationForm tools={TOOLS} onAdd={onAdd} />)

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Tool' }),
      'Webhook',
    )
    await user.type(screen.getByLabelText('Name'), ' Helpdesk ')
    await user.click(screen.getByRole('button', { name: 'Add integration' }))

    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.queryByLabelText('Key')).toBe(null)
    expect(onAdd.mock.calls).toEqual([
      [{ tool: 'webhook', address: 'Helpdesk' }],
    ])
  })

  it.each([
    ['PostHog', 'Project ID', 'PostHog has no project 12345'],
    ['Webhook', 'Name', '"Helpdesk" is an Integration already'],
  ])(
    'says at the control of %s why the server refused the address',
    async (tool, label, reason) => {
      render(
        <IntegrationForm
          tools={TOOLS}
          errors={{ address: reason }}
          onAdd={() => {}}
        />,
      )

      await userEvent
        .setup()
        .selectOptions(screen.getByRole('combobox', { name: 'Tool' }), tool)

      expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe(
        'true',
      )
      expect(screen.getByText(reason)).toBeDefined()
    },
  )

  it('shows that the write runs in the place of its button, and another reason under the fields', () => {
    render(
      <IntegrationForm
        tools={[GITHUB]}
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
