import {
  Button,
  ComboButton,
  InlineLoading,
  InlineNotification,
  MenuItem,
  Modal,
  OverflowMenu,
  OverflowMenuItem,
  RadioButton,
  RadioButtonGroup,
  Select,
  SelectItem,
  TextArea,
} from '@carbon/react'
import { useEffect, useId, useRef, useState } from 'react'

import { PartSearch } from './part-search.tsx'
import type { PartFormPart } from './part-search.tsx'
import { useHydrated } from './use-hydrated.ts'
import styles from './next-box.module.scss'

// An action that runs with a click. An action that cannot be undone names
// the dialog that asks first: its title and the words of its button.
type ClickAction = {
  label: string
  onClick: () => void
  confirm?: { title: string; label: string }
}

// The search for the Part that an action needs: its label, and the run with
// the record id of the pick.
type PartPick = { label: string; onPick: (recordId: string) => void }

// The choice that an action needs: its label, its options, and the run with
// the value of the pick. A choice with `words` takes a text too: the label
// of its field. The run gets the text, and waits for it.
type OptionPick = {
  label: string
  options: ReadonlyArray<{ value: string; text: string }>
  words?: string
  onPick: (value: string, words: string) => void
}

// One action of the box. An action with a pick asks for a Part first, and
// one with a choice for one of its options. An action with an address is a
// link: it goes to a person or to a tool outside Glue.
export type NextAction =
  | ClickAction
  | { label: string; pick: PartPick }
  | { label: string; choose: OptionPick }
  | { label: string; href: string }

export type NextBoxProps = {
  // The first action is the button: the next step. The others are in its
  // menu.
  actions?: ReadonlyArray<NextAction>
  // false: no step is left. The box has no button, and each action is in
  // the menu.
  hasStep?: boolean
  // The words of the action that runs. They take the place of the button.
  pending?: string
  // Why the last action failed.
  error?: string
  // With it the box takes an answer in words, above the button.
  words?: { value: string; onChange: (value: string) => void }
  // With it the box shows the options of a question as one choice. `value`
  // counts the options from 1.
  choice?: {
    options: ReadonlyArray<string>
    value: number | null
    onChange: (option: number) => void
  }
  // The Parts that the pick of an action can go to.
  pickParts?: ReadonlyArray<PartFormPart>
}

// The box Next of a Part or of a Concept: the one button of the next step,
// with the other actions in its menu. With no step left it has the menu
// alone. A box with no action, no running action and no failure is left out.
export function NextBox({
  actions = [],
  hasStep = true,
  pending,
  error,
  words,
  choice,
  pickParts = [],
}: NextBoxProps) {
  const nextId = useId()
  const wordsId = useId()
  const choiceId = useId()
  const pickId = useId()
  const chooseId = useId()
  const chooseWordsId = useId()
  // Carbon renders the closed menu of the button on the server and not in
  // the browser. So the menu comes after the page is hydrated.
  const hydrated = useHydrated()
  // The action that waits for the answer of its dialog.
  const [confirming, setConfirming] = useState<ClickAction>()
  // The pick that waits for its Part.
  const [picking, setPicking] = useState<PartPick>()
  // The choice that is open: the label of its action, and the option that
  // is chosen. The button of the box sends it.
  const [choosing, setChoosing] = useState<{
    label: string
    choose: OptionPick
    chosen: string | undefined
    words: string
  }>()
  // The focus goes back to the button of the box when the choice closes
  // with Escape or with the button. The button is away while a write saves.
  const nextRef = useRef<HTMLElement>(null)
  const refocus = useRef(false)
  useEffect(() => {
    const button = nextRef.current?.querySelector('button')
    if (!refocus.current || !button) return
    refocus.current = false
    button.focus()
  })
  const isChoosing = choosing !== undefined
  useEffect(() => {
    if (!isChoosing) return
    const leave = ({ key }: KeyboardEvent) => {
      if (key !== 'Escape') return
      refocus.current = true
      setChoosing(undefined)
    }
    document.addEventListener('keydown', leave)
    return () => document.removeEventListener('keydown', leave)
  }, [isChoosing])
  const send = () => {
    if (choosing?.chosen === undefined) return
    const said = choosing.words.trim()
    if (choosing.choose.words !== undefined && said === '') return
    refocus.current = true
    setChoosing(undefined)
    choosing.choose.onPick(choosing.chosen, said)
  }
  const run = (action: NextAction) => {
    if ('pick' in action) setPicking(action.pick)
    else if ('choose' in action) {
      const { label, choose } = action
      // A second pick of the action closes its choice.
      setChoosing((open) =>
        open?.label === label
          ? undefined
          : { label, choose, chosen: choose.options.at(0)?.value, words: '' },
      )
    } else if ('href' in action) window.location.assign(action.href)
    else if (action.confirm) setConfirming(action)
    else action.onClick()
  }
  const action = hasStep ? actions.at(0) : undefined
  const otherActions = hasStep ? actions.slice(1) : actions

  if (actions.length === 0 && pending === undefined && error === undefined) {
    return null
  }

  return (
    <>
      <section ref={nextRef} aria-labelledby={nextId} className={styles.box}>
        <h2 id={nextId} className={styles.title}>
          Next
        </h2>
        {choice && (
          <RadioButtonGroup
            legendText="Options"
            name={choiceId}
            orientation="vertical"
            valueSelected={choice.value ?? undefined}
            onChange={(option) => choice.onChange(Number(option))}
          >
            {choice.options.map((option, index) => (
              <RadioButton
                key={option}
                id={`${choiceId}-${index + 1}`}
                labelText={option}
                value={index + 1}
              />
            ))}
          </RadioButtonGroup>
        )}
        {words && (
          <div className={styles.words}>
            <TextArea
              id={wordsId}
              labelText="Answer"
              rows={2}
              value={words.value}
              onChange={({ target }) => words.onChange(target.value)}
            />
          </div>
        )}
        {choosing && pending === undefined && (
          <div className={styles.search}>
            <Select
              id={chooseId}
              labelText={choosing.choose.label}
              value={choosing.chosen}
              onChange={({ target }) =>
                setChoosing({ ...choosing, chosen: target.value })
              }
            >
              {choosing.choose.options.map(({ value, text }) => (
                <SelectItem key={value} value={value} text={text} />
              ))}
            </Select>
          </div>
        )}
        {choosing?.choose.words !== undefined && pending === undefined && (
          <div className={styles.words}>
            <TextArea
              id={chooseWordsId}
              labelText={choosing.choose.words}
              rows={2}
              value={choosing.words}
              onChange={({ target }) =>
                setChoosing({ ...choosing, words: target.value })
              }
            />
          </div>
        )}
        {pending !== undefined ? (
          <InlineLoading description={pending} />
        ) : !action ? (
          otherActions.length > 0 && (
            <OverflowMenu
              aria-label="Additional actions"
              iconDescription="Additional actions"
              align="bottom-start"
            >
              {otherActions.map((other) => (
                <OverflowMenuItem
                  key={other.label}
                  itemText={other.label}
                  onClick={() => run(other)}
                />
              ))}
            </OverflowMenu>
          )
        ) : otherActions.length > 0 && hydrated ? (
          <ComboButton
            label={choosing ? 'Send' : action.label}
            onClick={choosing ? send : () => run(action)}
          >
            {otherActions.map((other) => (
              <MenuItem
                key={other.label}
                label={other.label}
                onClick={() => run(other)}
              />
            ))}
          </ComboButton>
        ) : choosing ? (
          <Button onClick={send}>Send</Button>
        ) : 'href' in action ? (
          <Button href={action.href}>{action.label}</Button>
        ) : (
          <Button onClick={() => run(action)}>{action.label}</Button>
        )}
        {picking && pending === undefined && (
          <div className={styles.search}>
            <PartSearch
              id={pickId}
              label={picking.label}
              parts={pickParts}
              onPick={(recordId) => {
                setPicking(undefined)
                picking.onPick(recordId)
              }}
            />
          </div>
        )}
        {error !== undefined && (
          <InlineNotification
            kind="error"
            role="alert"
            lowContrast
            hideCloseButton
            title={error}
          />
        )}
      </section>
      {confirming?.confirm && (
        <Modal
          open
          danger
          size="xs"
          modalHeading={confirming.confirm.title}
          primaryButtonText={confirming.confirm.label}
          secondaryButtonText="Cancel"
          onRequestSubmit={() => {
            setConfirming(undefined)
            confirming.onClick()
          }}
          onRequestClose={() => setConfirming(undefined)}
        />
      )}
    </>
  )
}
