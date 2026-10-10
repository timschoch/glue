import {
  Button,
  Form,
  InlineLoading,
  InlineNotification,
  PasswordInput,
  Select,
  SelectItem,
  TextInput,
} from '@carbon/react'
import { useId, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

import viewStyles from './concept-view.module.scss'
import styles from './integrations.module.scss'
import { sourceLabels } from './signals.tsx'

// A tool has the name of the Signal source that its Signals show under.
const toToolLabel = (tool: string) => sourceLabels[tool] ?? tool

const stateLabels = {
  active: 'Active',
  paused: 'Paused',
  failed: 'Failed',
} as const

// One Integration: a tool of the team that Glue reads Signals from. The key
// stays on the server, only its last four characters show.
export type IntegrationRow = {
  id: number
  tool: string
  address: string
  keyLastFour: string
  state: keyof typeof stateLabels
  // Why the last read failed.
  error?: string | null
}

export type IntegrationsProps = {
  integrations: ReadonlyArray<IntegrationRow>
  // The write of one Integration that runs, or why it failed. While one
  // runs, no second one starts.
  change?: { id: number; pending?: string; failure?: string }
  // Without them, the person reads only.
  onPause?: (id: number) => void
  onStart?: (id: number) => void
  onRemove?: (id: number) => void
  // Shows the Signals again.
  onClose: () => void
  // The form that adds an Integration.
  children?: ReactNode
}

// The Integrations of a Project in the main window: each one with its tool,
// its address, the end of its key and its state. A member pauses, starts
// and removes each one.
export function Integrations({
  integrations,
  change,
  onPause,
  onStart,
  onRemove,
  onClose,
  children,
}: IntegrationsProps) {
  const titleId = useId()
  const isWriting = change?.pending !== undefined

  return (
    <div className={viewStyles.view}>
      <header className={styles.head}>
        <h1 id={titleId} className={viewStyles.title}>
          Integrations
        </h1>
        <Button size="sm" kind="ghost" onClick={onClose}>
          Signals
        </Button>
      </header>
      {integrations.length > 0 && (
        <ul aria-labelledby={titleId} className={styles.list}>
          {integrations.map(
            ({ id, tool, address, keyLastFour, state, error }) => {
              const own = change?.id === id ? change : undefined
              const name = `${toToolLabel(tool)} ${address}`
              const restart = state === 'active' ? onPause : onStart
              return (
                <li key={id} className={styles.row}>
                  <span className={styles.tool}>{toToolLabel(tool)}</span>
                  <span className={styles.address}>{address}</span>
                  <span className={styles.label}>••••{keyLastFour}</span>
                  <span className={styles.label}>{stateLabels[state]}</span>
                  <div className={styles.actions}>
                    {own?.pending !== undefined ? (
                      <InlineLoading
                        description={own.pending}
                        className={styles.pending}
                      />
                    ) : (
                      <>
                        {restart && (
                          <Button
                            size="sm"
                            kind="ghost"
                            aria-label={`${state === 'active' ? 'Pause' : 'Start'} ${name}`}
                            disabled={isWriting}
                            onClick={() => restart(id)}
                          >
                            {state === 'active' ? 'Pause' : 'Start'}
                          </Button>
                        )}
                        {onRemove && (
                          <Button
                            size="sm"
                            kind="danger--ghost"
                            aria-label={`Remove ${name}`}
                            disabled={isWriting}
                            onClick={() => onRemove(id)}
                          >
                            Remove
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                  {state === 'failed' && error && (
                    <span className={styles.reason}>{error}</span>
                  )}
                  {own?.failure && (
                    <InlineNotification
                      kind="error"
                      role="alert"
                      lowContrast
                      hideCloseButton
                      className={styles.failure}
                      title={own.failure}
                    />
                  )}
                </li>
              )
            },
          )}
        </ul>
      )}
      {children}
    </div>
  )
}

export type IntegrationFormValues = {
  tool: string
  address: string
  key: string
}

// The fields that the server names when it refuses an Integration: each one
// shows the reason at its control.
export const integrationFormFields = ['tool', 'address', 'key'] as const
type IntegrationFormField = (typeof integrationFormFields)[number]

export type IntegrationFormProps = {
  // The names of the tools that a member can connect.
  tools: ReadonlyArray<string>
  // The reason of each field with a wrong value.
  errors?: Partial<Record<IntegrationFormField, string>>
  serverError?: string
  // The words of the write that runs: the form takes no second one.
  pending?: string
  // Gets the address and the key without the spaces around them.
  onAdd: (integration: IntegrationFormValues) => void
}

// The form that adds an Integration: its tool, its address there and the
// key of the team. The key never shows as text.
export function IntegrationForm({
  tools,
  errors = {},
  serverError,
  pending,
  onAdd,
}: IntegrationFormProps) {
  const formId = useId()
  const [tool, setTool] = useState(tools[0])
  const [address, setAddress] = useState('')
  const [key, setKey] = useState('')
  const values = { tool, address: address.trim(), key: key.trim() }
  const canAdd = values.address !== '' && values.key !== ''

  const add = (event: FormEvent) => {
    event.preventDefault()
    if (canAdd && pending === undefined) onAdd(values)
  }

  return (
    <Form className={styles.form} onSubmit={add}>
      <Select
        id={`${formId}-tool`}
        labelText="Tool"
        invalid={errors.tool !== undefined}
        invalidText={errors.tool}
        value={tool}
        onChange={({ target }) => setTool(target.value)}
      >
        {tools.map((name) => (
          <SelectItem key={name} value={name} text={toToolLabel(name)} />
        ))}
      </Select>
      <TextInput
        id={`${formId}-address`}
        labelText="Address"
        invalid={errors.address !== undefined}
        invalidText={errors.address}
        value={address}
        onChange={({ target }) => setAddress(target.value)}
      />
      <PasswordInput
        id={`${formId}-key`}
        labelText="Key"
        autoComplete="off"
        invalid={errors.key !== undefined}
        invalidText={errors.key}
        value={key}
        onChange={({ target }) => setKey(target.value)}
      />
      {serverError && (
        <InlineNotification
          kind="error"
          role="alert"
          lowContrast
          hideCloseButton
          className={styles.failure}
          title={serverError}
        />
      )}
      {pending !== undefined ? (
        <InlineLoading description={pending} />
      ) : (
        <Button type="submit" size="sm" disabled={!canAdd}>
          Add integration
        </Button>
      )}
    </Form>
  )
}
