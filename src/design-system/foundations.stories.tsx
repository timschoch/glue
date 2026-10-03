import {
  CheckmarkFilled,
  ErrorFilled,
  Misuse,
  WarningAltFilled,
} from '@carbon/icons-react'
import { Link } from '@carbon/react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'

import styles from './foundations.module.scss'

// The style map as examples: each sample shows a style, and its words are
// the one meaning that style carries.
const meta = { title: 'Foundations' } satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Specimen({ token, children }: { token: string; children: ReactNode }) {
  return (
    <div className={styles.specimen}>
      {children}
      <span className={styles.token}>{token}</span>
    </div>
  )
}

function Surface({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.surface} ${styles['layer-01']}`}>
      <div className={styles.specimens}>{children}</div>
    </div>
  )
}

function Layer({
  token,
  meaning,
  children,
}: {
  token: 'background' | 'layer-01' | 'layer-02' | 'layer-03'
  meaning: string
  children?: ReactNode
}) {
  return (
    <div className={`${styles.surface} ${styles[token]}`}>
      <Specimen token={`$${token}`}>
        <span className={styles['text-primary']}>{meaning}</span>
      </Specimen>
      {children}
    </div>
  )
}

export const Layers: Story = {
  render: () => (
    <Layer token="background" meaning="Canvas">
      <Layer token="layer-01" meaning="Surface">
        <Layer token="layer-02" meaning="Nested surface">
          <Layer token="layer-03" meaning="Third level" />
        </Layer>
      </Layer>
    </Layer>
  ),
}

export const TextColours: Story = {
  render: () => (
    <Surface>
      <Specimen token="$text-primary">
        <span className={styles['text-primary']}>Content</span>
      </Specimen>
      <Specimen token="$text-secondary">
        <span className={styles['text-secondary']}>Label</span>
      </Specimen>
      <Specimen token="$text-placeholder">
        <span className={styles['text-placeholder']}>Missing value</span>
      </Specimen>
      <Specimen token="$link-primary">
        <Link href="#">Link</Link>
      </Specimen>
    </Surface>
  ),
}

export const SupportColours: Story = {
  render: () => (
    <Surface>
      <Specimen token="$support-success">
        <span className={styles.sign}>
          <CheckmarkFilled className={styles['support-success']} />
          Solid
        </span>
      </Specimen>
      <Specimen token="$support-warning">
        <span className={styles.sign}>
          <WarningAltFilled className={styles['support-warning']} />
          Flagged
        </span>
      </Specimen>
      <Specimen token="$support-error">
        <span className={styles.sign}>
          <ErrorFilled className={styles['support-error']} />
          Not ready
        </span>
      </Specimen>
      <Specimen token="$icon-primary">
        <span className={styles.sign}>
          <Misuse className={styles['icon-primary']} />
          Wrong
        </span>
      </Specimen>
    </Surface>
  ),
}

export const TypeScale: Story = {
  render: () => (
    <Surface>
      <Specimen token="$heading-03">
        <span className={styles['heading-03']}>Page title</span>
      </Specimen>
      <Specimen token="$heading-compact-02">
        <span className={styles['heading-compact-02']}>
          Record title in the detail panel
        </span>
      </Specimen>
      <Specimen token="$heading-compact-01">
        <span className={styles['heading-compact-01']}>
          Record title in a card
        </span>
      </Specimen>
      <Specimen token="$body-compact-01">
        <span className={styles['text-primary']}>Value</span>
      </Specimen>
      <Specimen token="$label-01">
        <span className={styles['label-01']}>Label</span>
      </Specimen>
    </Surface>
  ),
}

export const SpacingScale: Story = {
  render: () => (
    <Surface>
      <Specimen token="$spacing-03">
        <span className={styles['text-primary']}>Inside a group</span>
        <div className={styles['spacing-03']} />
      </Specimen>
      <Specimen token="$spacing-05">
        <span className={styles['text-primary']}>Padding of a surface</span>
        <div className={styles['spacing-05']} />
      </Specimen>
      <Specimen token="$spacing-07">
        <span className={styles['text-primary']}>Between groups</span>
        <div className={styles['spacing-07']} />
      </Specimen>
    </Surface>
  ),
}

export const Borders: Story = {
  render: () => (
    <Surface>
      <Specimen token="$border-subtle-01">
        <div className={styles['border-subtle']}>Separation</div>
      </Specimen>
      <Specimen token="$border-interactive">
        <div className={styles['border-interactive']}>Current</div>
      </Specimen>
      <Specimen token="$border-strong-01">
        <div className={styles['border-strong']}>Missing</div>
      </Specimen>
    </Surface>
  ),
}
