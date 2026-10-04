import { Popover, PopoverContent, TextArea } from '@carbon/react'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import { partTypes } from './card.tsx'
import styles from './part-form.module.scss'
import type { PartFormPart } from './part-search.tsx'

// A `#` at the start of a word, and the search that follows it up to the
// caret.
const MENTION = /(?:^|\s)#([a-z0-9-]*)$/i

// The mention that the person writes: where its `#` is, and its search.
type OpenMention = { start: number; search: string; active: number }

function matchesSearch({ id, title }: PartFormPart, search: string) {
  const words = search.toLowerCase()
  return id.toLowerCase().includes(words) || title.toLowerCase().includes(words)
}

// The body of a Part: Markdown. After a `#` it lists the given Parts, and a
// pick puts the record id into the text (D37).
export function PartFormBody({
  id,
  label,
  value,
  parts,
  invalidText,
  onChange,
}: {
  id: string
  label: string
  value: string
  parts: ReadonlyArray<PartFormPart>
  invalidText?: string
  onChange: (value: string) => void
}) {
  const listId = useId()
  const field = useRef<HTMLTextAreaElement>(null)
  // The place of the caret after a pick.
  const caret = useRef<number>(undefined)
  const [mention, setMention] = useState<OpenMention>()
  const options = mention
    ? parts.filter((part) => matchesSearch(part, mention.search))
    : []
  const open = options.length > 0
  const optionId = (part: PartFormPart) => `${listId}-${part.id}`

  useLayoutEffect(() => {
    if (caret.current === undefined) return
    field.current?.setSelectionRange(caret.current, caret.current)
    caret.current = undefined
  }, [value])

  const pick = (part: PartFormPart) => {
    if (!mention) return
    const end = mention.start + 1 + mention.search.length
    const text = `#${part.id}`
    caret.current = mention.start + text.length
    setMention(undefined)
    onChange(value.slice(0, mention.start) + text + value.slice(end))
  }

  const move = (step: number) =>
    setMention(
      (current) =>
        current && {
          ...current,
          active: (current.active + step + options.length) % options.length,
        },
    )

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mention || !open) return
    switch (event.key) {
      case 'ArrowDown':
        move(1)
        break
      case 'ArrowUp':
        move(-1)
        break
      case 'Enter':
        pick(options[mention.active])
        break
      case 'Escape':
        setMention(undefined)
        break
      default:
        return
    }
    event.preventDefault()
  }

  return (
    <Popover
      open={open}
      align="bottom-start"
      autoAlign
      caret={false}
      className={styles.body}
    >
      <TextArea
        ref={field}
        id={id}
        labelText={label}
        value={value}
        invalid={invalidText !== undefined}
        invalidText={invalidText}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={
          mention && open ? optionId(options[mention.active]) : undefined
        }
        onChange={({ target }) => {
          const found = MENTION.exec(
            target.value.slice(0, target.selectionStart),
          )
          setMention(
            found
              ? {
                  start: target.selectionStart - found[1].length - 1,
                  search: found[1],
                  active: 0,
                }
              : undefined,
          )
          onChange(target.value)
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setMention(undefined)}
      />
      {mention && open && (
        <PopoverContent>
          <ul
            id={listId}
            role="listbox"
            aria-label="Records"
            className={styles.mentions}
          >
            {options.map((part, index) => (
              <li
                key={part.id}
                id={optionId(part)}
                role="option"
                aria-selected={index === mention.active}
                className={styles.mention}
                // The focus stays in the field.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(part)}
              >
                <span className={styles.mentionType}>
                  {partTypes[part.type]}
                </span>{' '}
                <span className={styles.mentionType}>{part.id}</span>{' '}
                <span>{part.title}</span>
              </li>
            ))}
          </ul>
        </PopoverContent>
      )}
    </Popover>
  )
}
