import {
  Button,
  CodeSnippet,
  Form,
  InlineLoading,
  InlineNotification,
  Modal,
  PasswordInput,
  Select,
  SelectItem,
  TextInput,
} from '@carbon/react'
import { useId, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

import viewStyles from './concept-view.module.scss'
import styles from './integrations.module.scss'

const stateLabels = {
  active: 'Active',
  paused: 'Paused',
  failed: 'Failed',
} as const

// The length of the day and the minute in a time: `2026-10-09T08:30`.
const MINUTE_LENGTH = 16

// One Integration: a tool of the team that Glue reads Signals from. The key
// stays on the server, only its last four characters show.
export type IntegrationRow = {
  id: number
  // The name of the tool as a person reads it.
  tool: string
  address: string
  keyLastFour: string
  state: keyof typeof stateLabels
  // The last read: its time, and the count of its Signals or why it failed.
  // None: Glue did not read the tool yet.
  lastRead?: {
    at: string
    signalCount: number | null
    error: string | null
  } | null
}

type IntegrationRowsProps = {
  // The id of the title that names the list.
  titleId: string
  integrations: ReadonlyArray<IntegrationRow>
  // The write of one Integration that runs, or why it failed, with the field
  // that the server refused. `isKey`: the form of the new key started it and
  // shows it. While one runs, no second one starts.
  change?: {
    id: number
    pending?: string
    failure?: string
    field?: string
    isKey?: boolean
  }
  // The Integration that shows the form for a new key.
  keyOf?: number
  // Without them, the person reads only.
  onPause?: (id: number) => void
  onStart?: (id: number) => void
  onRemove?: (id: number) => void
  // Opens the form for a new key at one Integration. Without an id, closes
  // it.
  onEditKey?: (id?: number) => void
  // Gets the new key without the spaces around it.
  onSetKey?: (id: number, key: string) => void
}

export type IntegrationsProps = Omit<IntegrationRowsProps, 'titleId'> & {
  // Shows the Signals again.
  onClose: () => void
  // The form that adds an Integration.
  children?: ReactNode
}

// The Integrations of a Project in the main window, with the form that adds
// one.
export function Integrations({
  onClose,
  children,
  ...list
}: IntegrationsProps) {
  const titleId = useId()

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
      <IntegrationRows titleId={titleId} {...list} />
      {children}
    </div>
  )
}

// The failed Integrations that a member is Responsible for, in Mine.
export function FailedIntegrations(
  list: Omit<IntegrationRowsProps, 'titleId'>,
) {
  const titleId = useId()

  return (
    <section aria-labelledby={titleId} className={styles.group}>
      <h2 id={titleId} className={styles.title}>
        Integrations
      </h2>
      <IntegrationRows titleId={titleId} {...list} />
    </section>
  )
}

// Each Integration with its tool, its address, the end of its key, its state
// and its last read. A member pauses and starts each one, gives it a new
// key, and removes it after one question.
function IntegrationRows({
  titleId,
  integrations,
  change,
  keyOf,
  onPause,
  onStart,
  onRemove,
  onEditKey,
  onSetKey,
}: IntegrationRowsProps) {
  const isWriting = change?.pending !== undefined
  // The Integration that the dialog asks about before it is removed.
  const [removed, setRemoved] = useState<{ id: number; name: string }>()

  return (
    <>
      {integrations.length > 0 && (
        <ul aria-labelledby={titleId} className={styles.list}>
          {integrations.map(
            ({ id, tool, address, keyLastFour, state, lastRead }) => {
              const own = change?.id === id ? change : undefined
              const name = `${tool} ${address}`
              const restart = state === 'active' ? onPause : onStart
              const hasKeyForm = keyOf === id && onSetKey !== undefined
              // The form of the new key shows its own write. Each other
              // write shows at the row.
              const ownKey = hasKeyForm && own?.isKey ? own : undefined
              const keyError =
                ownKey?.field === 'key' ? ownKey.failure : undefined
              return (
                <li key={id} className={styles.row}>
                  <span className={styles.tool}>{tool}</span>
                  <span className={styles.address}>{address}</span>
                  <span className={styles.label}>••••{keyLastFour}</span>
                  <span className={styles.label}>{stateLabels[state]}</span>
                  <div className={styles.actions}>
                    {own?.pending !== undefined && !ownKey ? (
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
                        {onEditKey && onSetKey && (
                          <Button
                            size="sm"
                            kind="ghost"
                            aria-label={`New key ${name}`}
                            disabled={isWriting || hasKeyForm}
                            onClick={() => onEditKey(id)}
                          >
                            New key
                          </Button>
                        )}
                        {onRemove && (
                          <Button
                            size="sm"
                            kind="danger--ghost"
                            aria-label={`Remove ${name}`}
                            disabled={isWriting}
                            onClick={() => setRemoved({ id, name })}
                          >
                            Remove
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                  {lastRead && (
                    <span className={styles.read}>
                      <time dateTime={lastRead.at}>
                        {lastRead.at.slice(0, MINUTE_LENGTH).replace('T', ' ')}
                      </time>
                      {lastRead.signalCount !== null && (
                        <span>
                          {lastRead.signalCount}{' '}
                          {lastRead.signalCount === 1 ? 'Signal' : 'Signals'}
                        </span>
                      )}
                      {lastRead.error && (
                        <span className={styles.reason}>{lastRead.error}</span>
                      )}
                    </span>
                  )}
                  {hasKeyForm && (
                    <KeyForm
                      error={keyError}
                      pending={ownKey?.pending}
                      onSave={(key) => onSetKey(id, key)}
                      onCancel={() => onEditKey?.()}
                    />
                  )}
                  {own?.failure && keyError === undefined && (
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
      {removed && (
        <Modal
          open
          danger
          size="xs"
          modalHeading={`Remove ${removed.name}?`}
          primaryButtonText="Remove"
          secondaryButtonText="Cancel"
          onRequestSubmit={() => {
            setRemoved(undefined)
            onRemove?.(removed.id)
          }}
          onRequestClose={() => setRemoved(undefined)}
        />
      )}
    </>
  )
}

// The form that gives an Integration a new key, under its row. The key never
// shows as text.
function KeyForm({
  error,
  pending,
  onSave,
  onCancel,
}: {
  // Why the server refused the key.
  error?: string
  // The words of the write that runs: the form takes no second one.
  pending?: string
  onSave: (key: string) => void
  onCancel: () => void
}) {
  const keyId = useId()
  const [key, setKey] = useState('')
  const value = key.trim()

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (value !== '' && pending === undefined) onSave(value)
  }

  return (
    <Form className={styles.keyForm} onSubmit={save}>
      <PasswordInput
        id={keyId}
        labelText="New key"
        autoComplete="off"
        invalid={error !== undefined}
        invalidText={error}
        value={key}
        onChange={({ target }) => setKey(target.value)}
      />
      {pending !== undefined ? (
        <InlineLoading description={pending} />
      ) : (
        <div className={styles.keyActions}>
          <Button type="submit" size="sm" disabled={value === ''}>
            Save key
          </Button>
          <Button size="sm" kind="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </Form>
  )
}

// The name of a new Integration, the URL that its tool posts to and the
// secret that Glue made for it. The secret shows this one time: the server
// gives it back no more. So each value wraps, and no screen cuts it.
export function IntegrationSecret({
  name,
  address,
  secret,
}: {
  // The tool and the address of the Integration.
  name: string
  address: string
  secret: string
}) {
  const titleId = useId()
  return (
    <div role="group" aria-labelledby={titleId} className={styles.secret}>
      <h2 id={titleId} className={styles.tool}>
        {name}
      </h2>
      {[
        { label: 'URL', value: address },
        { label: 'Secret', value: secret },
      ].map(({ label, value }) => (
        <div key={label} className={styles.value}>
          <span className={styles.label}>{label}</span>
          <CodeSnippet
            type="multi"
            wrapText
            aria-label={label}
            copyButtonDescription={`Copy ${label}`}
            minCollapsedNumberOfRows={1}
            maxCollapsedNumberOfRows={0}
            className={styles.code}
          >
            {value}
          </CodeSnippet>
        </div>
      ))}
    </div>
  )
}

// A tool that Glue makes the secret for has no key.
export type IntegrationFormValues = {
  tool: string
  address: string
  key?: string
}

// The fields that the server names when it refuses an Integration: each one
// shows the reason at its control.
export const integrationFormFields = ['tool', 'address', 'key'] as const
type IntegrationFormField = (typeof integrationFormFields)[number]

export type IntegrationFormProps = {
  // The tools that a member can connect, each with what it asks for: the
  // values of its address, and a key or none.
  tools: ReadonlyArray<{
    name: string
    label: string
    addressFields: ReadonlyArray<{
      label: string
      // The values to pick from. None: the member types the value.
      options?: ReadonlyArray<{ value: string; label: string }>
    }>
    needsKey: boolean
  }>
  // The reason of each field with a wrong value.
  errors?: Partial<Record<IntegrationFormField, string>>
  serverError?: string
  // The words of the write that runs: the form takes no second one.
  pending?: string
  // Gets the address and the key without the spaces around them. The
  // address is the values that the tool asks for, with "/" between them.
  onAdd: (integration: IntegrationFormValues) => void
}

// The form that adds an Integration: its tool, then the controls that this
// tool asks for and no other. The key never shows as text. The reason for
// a refused address shows at the last control of the address.
export function IntegrationForm({
  tools,
  errors = {},
  serverError,
  pending,
  onAdd,
}: IntegrationFormProps) {
  const formId = useId()
  const [toolName, setToolName] = useState(tools[0].name)
  // The values of the address that the member gave, by the label of each.
  const [given, setGiven] = useState<Partial<Record<string, string>>>({})
  const [key, setKey] = useState('')
  const tool = tools.find(({ name }) => name === toolName) ?? tools[0]
  const { addressFields, needsKey } = tool
  const parts = addressFields.map(({ label, options }) =>
    (given[label] ?? options?.[0].value ?? '').trim(),
  )
  const values: IntegrationFormValues = {
    tool: tool.name,
    address: parts.join('/'),
    ...(needsKey ? { key: key.trim() } : {}),
  }
  const canAdd = parts.every((part) => part !== '') && values.key !== ''
  const give = (label: string, value: string) =>
    setGiven((before) => ({ ...before, [label]: value }))

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
        value={tool.name}
        onChange={({ target }) => {
          setToolName(target.value)
          setGiven({})
        }}
      >
        {tools.map(({ name, label }) => (
          <SelectItem key={name} value={name} text={label} />
        ))}
      </Select>
      {addressFields.map(({ label, options }, index) => {
        const id = `${formId}-${tool.name}-address-${index}`
        const error =
          index === addressFields.length - 1 ? errors.address : undefined
        const control = {
          id,
          labelText: label,
          invalid: error !== undefined,
          invalidText: error,
          value: given[label] ?? options?.[0].value ?? '',
        }
        return options ? (
          <Select
            key={id}
            {...control}
            onChange={({ target }) => give(label, target.value)}
          >
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                text={option.label}
              />
            ))}
          </Select>
        ) : (
          <TextInput
            key={id}
            {...control}
            onChange={({ target }) => give(label, target.value)}
          />
        )
      })}
      {needsKey && (
        <PasswordInput
          id={`${formId}-key`}
          labelText="Key"
          autoComplete="off"
          invalid={errors.key !== undefined}
          invalidText={errors.key}
          value={key}
          onChange={({ target }) => setKey(target.value)}
        />
      )}
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
