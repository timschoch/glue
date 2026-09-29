import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { displayable, wcagContrast } from 'culori'
import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, mergeMantineTheme } from '@mantine/core'
import { cssVariablesResolver, theme, tokens } from './theme'

type ColorRole = keyof typeof tokens.color

const root = join(import.meta.dirname, '..')

// Every `--name: value;` declaration in the text, with quotes and
// whitespace made the same, so Prettier's layout does not matter.
function declaredVariables(css: string): Record<string, string> {
  return Object.fromEntries(
    [...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [
      name,
      value.replace(/\s+/g, ' ').replaceAll("'", '"').trim(),
    ]),
  )
}

// The tokens as CSS variables: `--<group>-<name>`, a ramp adds `-<step>`.
function themeVariables(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tokens).flatMap(([group, values]) =>
      Object.entries<string | ReadonlyArray<string>>(values).flatMap(
        ([name, value]) =>
          typeof value === 'string'
            ? [[`--${group}-${name}`, value]]
            : value.map((step, index) => [`--${group}-${name}-${index}`, step]),
      ),
    ),
  )
}

function designCss(): string {
  const design = readFileSync(join(root, 'design.md'), 'utf8')
  return [...design.matchAll(/```css\n([\s\S]*?)```/g)]
    .map(([, block]) => block)
    .join('\n')
}

// The ramp step that a colour role points at.
function rampColor(role: ColorRole): string {
  const reference = /^var\(--ramp-(neutral|accent|danger)-(\d)\)$/.exec(
    tokens.color[role],
  )
  if (!reference) throw new Error(`${role} does not point at a ramp step`)
  const [, ramp, step] = reference
  return tokens.ramp[ramp as keyof typeof tokens.ramp][Number(step)]
}

function contrast(foreground: ColorRole, background: ColorRole): number {
  return wcagContrast(rampColor(foreground), rampColor(background))
}

describe('design tokens', () => {
  it('exports every token that design.md names, with the same value', () => {
    const named = declaredVariables(designCss())

    expect(Object.keys(named)).toContain('--color-paper')
    expect(themeVariables()).toEqual(named)
  })

  it('declares every token as a CSS variable in src/styles.css', () => {
    const styles = readFileSync(join(root, 'src/styles.css'), 'utf8')

    expect(declaredVariables(styles)).toEqual(declaredVariables(designCss()))
  })
})

// The theme as MantineProvider sees it, against the values in design.md.
describe('Mantine theme', () => {
  const named = declaredVariables(designCss())
  const merged = mergeMantineTheme(DEFAULT_THEME, theme)

  it('uses the accent ramp as the primary colour', () => {
    expect(merged.primaryColor).toBe('accent')
    expect(named['--color-accent']).toBe(
      `var(--ramp-accent-${merged.primaryShade})`,
    )
    expect(merged.colors.accent[7]).toBe(named['--ramp-accent-7'])
  })

  it('uses the neutral ramp for gray, white and black', () => {
    expect(merged.colors.gray[6]).toBe(named['--ramp-neutral-6'])
    expect(merged.white).toBe(named['--ramp-neutral-0'])
    expect(merged.black).toBe(named['--ramp-neutral-9'])
  })

  it('uses the danger ramp for red, so an error has the colour of the design', () => {
    const variables = cssVariablesResolver(merged)

    expect(merged.colors.red[7]).toBe(named['--ramp-danger-7'])
    expect(named['--color-danger']).toBe('var(--ramp-danger-7)')
    expect(variables.light['--mantine-color-error']).toBe('var(--color-danger)')
  })

  it('uses the three font families', () => {
    expect(merged.fontFamily).toBe(named['--font-body'])
    expect(merged.fontFamilyMonospace).toBe(named['--font-mono'])
    expect(merged.headings.fontFamily).toBe(named['--font-display'])
  })

  it('uses the type steps', () => {
    expect(merged.fontSizes.sm).toBe(named['--text-sm'])
    expect(merged.headings.sizes.h1.fontSize).toBe(named['--text-xl'])
    expect(merged.headings.sizes.h2.fontSize).toBe(named['--text-lg'])
    expect(merged.lineHeights.md).toBe(named['--leading-prose'])
  })

  // A record title is a heading that wraps to three lines and more.
  it.each(['h1', 'h2', 'h3'] as const)(
    'gives the heading %s the line height of text that wraps',
    (heading) => {
      expect(merged.headings.sizes[heading].lineHeight).toBe(
        named['--leading-ui'],
      )
    },
  )

  it('uses the space and radius steps', () => {
    expect(merged.spacing.lg).toBe(named['--space-lg'])
    expect(merged.spacing['2xs']).toBe(named['--space-2xs'])
    expect(merged.defaultRadius).toBe('sm')
    expect(merged.radius.sm).toBe(named['--radius-control'])
    expect(merged.radius.md).toBe(named['--radius-card'])
  })

  it('puts the page on paper', () => {
    const variables = cssVariablesResolver(merged)

    expect(variables.light['--mantine-color-body']).toBe('var(--color-paper)')
  })
})

// WCAG 2.2: 4.5:1 for text (1.4.3), 3:1 for the parts of a control (1.4.11).
describe('colour contrast', () => {
  const surfaces = ['paper', 'paper-raised'] as const
  const textRoles = [
    'ink',
    'ink-soft',
    'muted',
    'accent',
    'accent-strong',
    'danger',
  ] as const

  it.each(
    surfaces.flatMap((surface) =>
      textRoles.map((role) => [role, surface] as const),
    ),
  )('%s text on %s has 4.5:1 or more', (role, surface) => {
    expect(contrast(role, surface)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['accent', 'accent-strong'] as const)(
    'accent-ink text on %s has 4.5:1 or more',
    (background) => {
      expect(contrast('accent-ink', background)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(
    surfaces.flatMap((surface) =>
      (['focus', 'rule-strong'] as const).map(
        (role) => [role, surface] as const,
      ),
    ),
  )('%s on %s has 3:1 or more', (role, surface) => {
    expect(contrast(role, surface)).toBeGreaterThanOrEqual(3)
  })

  it('keeps every ramp step inside sRGB, so all screens show the same colour', () => {
    const steps = Object.values(tokens.ramp).flat()

    expect(steps.filter((step) => !displayable(step))).toEqual([])
  })
})
