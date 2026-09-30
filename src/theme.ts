import { createTheme } from '@mantine/core'
import type { CSSVariablesResolver } from '@mantine/core'

// The design tokens that design.md names. src/styles.css declares the same
// values as CSS variables: `--<group>-<name>`, a ramp adds `-<step>`.
export const tokens = {
  ramp: {
    neutral: [
      'oklch(99.2% 0.004 85)',
      'oklch(97.6% 0.006 85)',
      'oklch(95.2% 0.008 85)',
      'oklch(89% 0.01 85)',
      'oklch(80% 0.012 85)',
      'oklch(62% 0.014 85)',
      'oklch(47% 0.014 85)',
      'oklch(36% 0.014 85)',
      'oklch(28% 0.012 85)',
      'oklch(21% 0.012 85)',
    ],
    accent: [
      'oklch(97% 0.012 262)',
      'oklch(93.5% 0.028 262)',
      'oklch(88% 0.052 262)',
      'oklch(80% 0.085 262)',
      'oklch(70% 0.12 262)',
      'oklch(60% 0.15 262)',
      'oklch(52% 0.17 262)',
      'oklch(44% 0.16 262)',
      'oklch(37% 0.14 262)',
      'oklch(29% 0.11 262)',
    ],
    danger: [
      'oklch(97% 0.012 25)',
      'oklch(93.5% 0.028 25)',
      'oklch(88% 0.052 25)',
      'oklch(80% 0.085 25)',
      'oklch(70% 0.12 25)',
      'oklch(60% 0.15 25)',
      'oklch(52% 0.17 25)',
      'oklch(44% 0.16 25)',
      'oklch(37% 0.14 25)',
      'oklch(29% 0.11 25)',
    ],
  },
  color: {
    paper: 'var(--ramp-neutral-1)',
    'paper-raised': 'var(--ramp-neutral-0)',
    'paper-sunken': 'var(--ramp-neutral-2)',
    rule: 'var(--ramp-neutral-3)',
    'rule-strong': 'var(--ramp-neutral-5)',
    muted: 'var(--ramp-neutral-6)',
    'ink-soft': 'var(--ramp-neutral-7)',
    ink: 'var(--ramp-neutral-9)',
    accent: 'var(--ramp-accent-7)',
    'accent-strong': 'var(--ramp-accent-8)',
    'accent-wash': 'var(--ramp-accent-1)',
    'accent-ink': 'var(--ramp-neutral-0)',
    focus: 'var(--ramp-accent-7)',
    danger: 'var(--ramp-danger-7)',
  },
  font: {
    display:
      '"Newsreader Variable", "Iowan Old Style", "Palatino Linotype", serif',
    body: '"IBM Plex Sans Variable", ui-sans-serif, system-ui, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
  },
  text: {
    xs: '0.75rem',
    sm: '0.875rem',
    md: '1rem',
    lg: '1.25rem',
    xl: '1.5625rem',
  },
  leading: {
    title: '1.25',
    ui: '1.4',
    prose: '1.55',
  },
  space: {
    '3xs': '0.125rem',
    '2xs': '0.25rem',
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2.5rem',
    '2xl': '4rem',
  },
  radius: {
    control: '0.25rem',
    card: '0.375rem',
  },
  measure: {
    prose: '68ch',
    form: '26rem',
    page: '60rem',
  },
  ease: {
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',
    in: 'cubic-bezier(0.7, 0, 0.84, 0)',
    'in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
  },
  duration: {
    micro: '120ms',
    short: '220ms',
  },
} as const

const { ramp, font, text, leading, space, radius } = tokens

export const theme = createTheme({
  primaryColor: 'accent',
  primaryShade: 7,
  colors: { accent: ramp.accent, gray: ramp.neutral, red: ramp.danger },
  white: ramp.neutral[0],
  black: ramp.neutral[9],
  fontFamily: font.body,
  fontFamilyMonospace: font.mono,
  fontSizes: text,
  // Text gets less line height as it gets larger.
  lineHeights: {
    xs: leading.ui,
    sm: leading.ui,
    md: leading.prose,
    lg: leading.title,
    xl: leading.title,
  },
  headings: {
    fontFamily: font.display,
    fontWeight: '600',
    // A record title is a heading that wraps to three lines and more.
    sizes: {
      h1: { fontSize: text.xl, lineHeight: leading.ui },
      h2: { fontSize: text.lg, lineHeight: leading.ui },
      h3: { fontSize: text.md, lineHeight: leading.ui },
    },
  },
  spacing: space,
  radius: { sm: radius.control, md: radius.card },
  defaultRadius: 'sm',
})

// Mantine takes its page, placeholder and error colours from the colour roles.
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--mantine-color-body': 'var(--color-paper)',
    '--mantine-color-placeholder': 'var(--color-muted)',
    '--mantine-color-error': 'var(--color-danger)',
  },
  dark: {},
})
