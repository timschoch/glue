// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { NameForm } from './name-form.tsx'
import type { NameFormProps } from './name-form.tsx'

afterEach(cleanup)

function renderForm(props: Partial<NameFormProps> = {}) {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  render(
    <NameForm
      heading="Concept"
      label="Title"
      onSave={onSave}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { onSave, onCancel }
}

const field = () => screen.getByRole<HTMLInputElement>('textbox')

const saveButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: 'Save' })

// The texts of the alerts. The Carbon field holds an empty one for its
// counter.
function alerts(): Array<string> {
  return screen
    .getAllByRole('alert')
    .map((alert) => alert.textContent)
    .filter((text) => text !== '')
}

describe('NameForm', () => {
  it('names what it adds as the page title, and has one field with its label', () => {
    renderForm({ heading: 'Project', label: 'Slug' })

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Project',
    )
    expect(screen.getByRole('form', { name: 'Project' })).toBeDefined()
    expect(screen.getAllByRole('textbox')).toEqual([
      screen.getByLabelText('Slug'),
    ])
  })

  it('shows the format of the field as its placeholder, and no helper text', () => {
    renderForm({ placeholder: 'bakeday' })

    expect(field().placeholder).toBe('bakeday')
    expect(document.querySelector('[class*="helper-text"]')).toBeNull()
  })

  it('has one primary button to save and one ghost button to cancel', async () => {
    const { onSave, onCancel } = renderForm()

    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.className.includes('btn--primary')),
    ).toEqual([saveButton()])

    const cancel = screen.getByRole('button', { name: 'Cancel' })

    expect(cancel.className).toContain('btn--ghost')

    await userEvent.click(cancel)

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('does not save an empty field, or a field of spaces', async () => {
    const { onSave } = renderForm()

    expect(saveButton().disabled).toBe(true)

    await userEvent.type(field(), '   {Enter}')

    expect(saveButton().disabled).toBe(true)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves the value without the spaces around it', async () => {
    const { onSave } = renderForm()

    await userEvent.type(field(), '  Step videos ')
    await userEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledExactlyOnceWith('Step videos')
  })

  it('saves with the Enter key', async () => {
    const { onSave } = renderForm()

    await userEvent.type(field(), 'Step videos{Enter}')

    expect(onSave).toHaveBeenCalledExactlyOnceWith('Step videos')
  })

  it('shows a wrong value as invalid, with the reason as the description of the field', () => {
    renderForm({ error: 'The slug bakeday is taken' })

    const describedBy = field().getAttribute('aria-describedby') ?? ''

    expect(field().getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(describedBy)?.textContent).toBe(
      'The slug bakeday is taken',
    )
  })

  it('shows a field with no reason as valid', () => {
    renderForm()

    expect(field().getAttribute('aria-invalid')).not.toBe('true')
    expect(field().hasAttribute('aria-describedby')).toBe(false)
  })

  it('shows an error of the server as one notification', () => {
    renderForm({ serverError: 'Not saved: no connection' })

    // Carbon names its icon in the alert.
    expect(alerts()).toEqual(['error iconNot saved: no connection'])
  })

  it('shows no notification without an error of the server', () => {
    renderForm()

    expect(alerts()).toEqual([])
  })

  it('shows the words of the action in the place of the save button while it saves, and saves no second time', async () => {
    const { onSave } = renderForm({ pending: true })

    expect(screen.getByText('Saving')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined()

    await userEvent.type(field(), 'Step videos{Enter}')

    expect(onSave).not.toHaveBeenCalled()
  })
})
