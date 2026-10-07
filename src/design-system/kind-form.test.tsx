// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { KindForm } from './kind-form.tsx'
import type { KindFormProps } from './kind-form.tsx'

const PRD: KindFormProps['kind'] = {
  name: 'PRD',
  slots: [
    { type: 'goal', required: true, minCount: 1 },
    { type: 'flow', required: true, minCount: 2 },
    { type: 'metric', required: false, minCount: 1 },
  ],
}

afterEach(cleanup)

function renderForm(props: Partial<KindFormProps> = {}) {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  render(<KindForm onSave={onSave} onCancel={onCancel} {...props} />)
  return { onSave, onCancel }
}

const nameField = () =>
  screen.getByRole<HTMLInputElement>('textbox', { name: 'Name' })

const saveButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: 'Save' })

// The fields of the slot of one Part type.
function slot(type: string) {
  const group = within(screen.getByRole('group', { name: type }))
  return {
    select: () => group.getByRole<HTMLSelectElement>('combobox'),
    count: () =>
      group.queryByRole<HTMLInputElement>('spinbutton', { name: 'At least' }),
  }
}

describe('KindForm', () => {
  it('has the name and one group per Part type, in the order of the loop', () => {
    renderForm()

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Kind')
    expect(nameField().value).toBe('')
    expect(
      screen
        .getAllByRole('group')
        .map((group) => group.querySelector('legend')?.textContent),
    ).toEqual([
      'Insight',
      'Goal',
      'Decision',
      'Guardrail',
      'Entity',
      'Flow',
      'Metric',
    ])
  })

  it('starts a new Kind with no slot, and shows the least count only for a slot', async () => {
    renderForm()

    expect(slot('Goal').select().value).toBe('none')
    expect(slot('Goal').count()).toBeNull()

    await userEvent.selectOptions(slot('Goal').select(), 'Required')

    expect(slot('Goal').count()?.value).toBe('1')
  })

  it('saves a new Kind with its slots', async () => {
    const { onSave } = renderForm()

    await userEvent.type(nameField(), ' PRD ')
    await userEvent.selectOptions(slot('Goal').select(), 'Required')
    await userEvent.selectOptions(slot('Flow').select(), 'Required')
    await userEvent.clear(slot('Flow').count()!)
    await userEvent.type(slot('Flow').count()!, '2')
    await userEvent.selectOptions(slot('Metric').select(), 'Optional')
    await userEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      name: 'PRD',
      slots: [
        { type: 'goal', required: true, minCount: 1 },
        { type: 'flow', required: true, minCount: 2 },
        { type: 'metric', required: false, minCount: 1 },
      ],
    })
  })

  it('shows the values of the Kind that it changes, and saves a slot that goes', async () => {
    const { onSave } = renderForm({ kind: PRD })

    expect(nameField().value).toBe('PRD')
    expect(slot('Goal').select().value).toBe('required')
    expect(slot('Flow').count()?.value).toBe('2')
    expect(slot('Metric').select().value).toBe('optional')
    expect(slot('Insight').select().value).toBe('none')

    await userEvent.selectOptions(slot('Metric').select(), 'No slot')
    await userEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      name: 'PRD',
      slots: [
        { type: 'goal', required: true, minCount: 1 },
        { type: 'flow', required: true, minCount: 2 },
      ],
    })
  })

  it('does not save a slot without a count', async () => {
    const { onSave } = renderForm({ kind: PRD })

    await userEvent.clear(slot('Flow').count()!)

    expect(saveButton().disabled).toBe(true)

    await userEvent.type(nameField(), '{Enter}')

    expect(onSave).not.toHaveBeenCalled()
  })

  it('does not save a Kind without a name', async () => {
    const { onSave } = renderForm()

    expect(saveButton().disabled).toBe(true)

    await userEvent.type(nameField(), '  {Enter}')

    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows an error of the server, and cancels with the ghost button', async () => {
    const { onCancel } = renderForm({
      serverError: 'kind "prd" exists already',
    })

    expect(
      screen
        .getAllByRole('alert')
        .some((alert) =>
          alert.textContent.includes('kind "prd" exists already'),
        ),
    ).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledOnce()
  })
})
