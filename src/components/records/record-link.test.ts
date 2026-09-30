import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { tokens } from '../../theme.ts'

const ROOT_FONT_SIZE = 16
const MINIMUM_TARGET = 24

const css = readFileSync(
  join(import.meta.dirname, 'record-link.module.css'),
  'utf8',
)

// The declarations of a class, up to its first nested rule.
function declarations(name: string): string {
  const rule = new RegExp(`\\.${name} \\{([^{}]*)`).exec(css)
  if (!rule) throw new Error(`No class ${name}`)
  return rule[1]
}

// The size in px of the space token that a property uses.
function space(name: string, property: string): number {
  const steps: Record<string, string> = tokens.space
  const step = new RegExp(`${property}:[^;]*var\\(--space-(\\w+)\\)`).exec(
    declarations(name),
  )
  if (!step) throw new Error(`${name} has no ${property} from a space token`)
  return pixels(steps[step[1]])
}

function pixels(rem: string): number {
  return Number.parseFloat(rem) * ROOT_FONT_SIZE
}

// WCAG 2.5.8 and design.md: a link is 24 px high or more.
describe('a record link', () => {
  const padding = space('reference', 'padding-block')

  it('is 24 px high or more in a list, where the text is the smallest', () => {
    const line = pixels(tokens.text.sm) * Number(tokens.leading.ui)

    // Padding makes an inline box no higher. An inline-block box gets higher.
    expect(declarations('reference')).toContain('display: inline-block')
    expect(line + 2 * padding).toBeGreaterThanOrEqual(MINIMUM_TARGET)
  })

  it('does not overlap the next link in a list', () => {
    expect(space('reference', 'margin-block')).toBe(padding)
    expect(space('records', 'gap')).toBeGreaterThanOrEqual(2 * padding)
  })
})
