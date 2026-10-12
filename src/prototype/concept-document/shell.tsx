import { Add, ArrowLeft, ArrowRight } from '@carbon/icons-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  Content,
  Dropdown,
  Header,
  Layer,
  SideNav,
  SideNavDivider,
  SideNavItems,
  SideNavLink,
} from '@carbon/react'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

import { signs } from '../../design-system/card.tsx'
import type { Trust } from '../../design-system/card.tsx'
import type { Variant } from '../../project/project-search.ts'
import { variants } from '../../project/project-search.ts'
import type { Entry, NextStep, Step } from './document.ts'
import { mineCount } from './seed.ts'
import styles from './shell.module.scss'

// PROTOTYPE, throwaway (design-system/D16). A copy of the navigation of
// design-system/D14, and the small pieces that the three variants share.

export const variantNames: Record<Variant, string> = {
  A: 'Page',
  B: 'Canvas',
  C: 'Threads',
}

type ShellLink = { name: string; href: string; current?: boolean }

// The left panel has the Project and its Concepts. The first item is the
// Concept of the Project itself.
export function Shell({
  project,
  concept,
  concepts,
  children,
}: {
  project: string
  concept: string
  concepts: ReadonlyArray<ShellLink>
  children: ReactNode
}) {
  return (
    <>
      <Header aria-label="Glue">
        <Breadcrumb noTrailingSlash className={styles.breadcrumb}>
          <BreadcrumbItem href="#project">{project}</BreadcrumbItem>
          <BreadcrumbItem isCurrentPage>{concept}</BreadcrumbItem>
        </Breadcrumb>
        <SideNav aria-label="Main" expanded={false}>
          <Layer className={styles.switcher}>
            <Dropdown
              id="project"
              titleText="Project"
              hideLabel
              label="Project"
              items={[project]}
              selectedItem={project}
            />
          </Layer>
          <SideNavItems>
            <SideNavLink href="#concept">Concept</SideNavLink>
            {concepts.map(({ name, href, current = false }) => (
              <SideNavLink
                key={href}
                href={href}
                isActive={current}
                aria-current={current ? 'page' : undefined}
              >
                {name}
              </SideNavLink>
            ))}
            <SideNavLink href="#add-concept" renderIcon={Add}>
              Add Concept
            </SideNavLink>
            <SideNavDivider />
            <SideNavLink href="#sign-out">Sign out</SideNavLink>
          </SideNavItems>
        </SideNav>
      </Header>
      <Content className={styles.content}>{children}</Content>
    </>
  )
}

// One line above the content: Mine, the five steps of the loop as a chain,
// then People. A step with a record is filled, a step with none is empty,
// and one step is current. Mine and People are no steps: they have no line.
// The next step lies below the current one. The children lie below the
// chain, in its five columns.
export function LoopSteps({
  stepCounts,
  current,
  next,
  className,
  children,
}: {
  stepCounts: ReadonlyArray<{ step: Step; count: number }>
  current?: Step
  next?: ReactNode
  className?: string
  children?: ReactNode
}) {
  const position = stepCounts.findIndex(({ step }) => step === current)

  return (
    <div className={className ? `${styles.loop} ${className}` : styles.loop}>
      <nav aria-label="Main" className={styles.line}>
        <a href="#mine" className={styles.beside}>
          <span>Mine</span>
          <span className={styles.count}>{mineCount}</span>
        </a>
        <ol className={styles.steps}>
          {stepCounts.map(({ step, count }) => (
            <li key={step}>
              <a
                href={`#${step}`}
                aria-current={step === current ? 'step' : undefined}
                className={count > 0 ? styles.step : styles.emptyStep}
              >
                <span>{step}</span>
                {count > 0 && <span className={styles.count}>{count}</span>}
              </a>
            </li>
          ))}
        </ol>
        <a href="#people" className={styles.beside}>
          People
        </a>
      </nav>
      {next && position >= 0 && (
        // The first column of the line is Mine.
        <div style={{ gridColumnStart: position + 2 }}>{next}</div>
      )}
      {children && <div className={styles.below}>{children}</div>}
    </div>
  )
}

// The sign: Trust as a glyph. A build has none.
export function Sign({ trust }: { trust?: Trust }) {
  if (!trust) return null
  const { word, Glyph, className } = signs[trust]
  return (
    <Glyph aria-label={word} className={`${className} ${styles.sign}`}>
      <title>{word}</title>
    </Glyph>
  )
}

// One record as one row. The whole row opens it.
export function EntryRow({
  entry,
  withId = false,
  withNeeds = false,
}: {
  entry: Entry
  withId?: boolean
  withNeeds?: boolean
}) {
  return (
    <a href={entry.href} className={styles.entry}>
      <Sign trust={entry.trust} />
      {withId && <span className={styles.entryId}>{entry.id}</span>}
      <span className={styles.entryTitle}>{entry.title}</span>
      {withNeeds && entry.needs.length > 0 && (
        <span className={styles.entryNeeds}>{entry.needs.join(' ')}</span>
      )}
    </a>
  )
}

// The reading of a Metric: its value and its target.
export function ReadingValue({ entry }: { entry: Entry }) {
  if (entry.reading?.value === undefined) return null
  return (
    <p className={styles.reading}>
      <span>{entry.reading.value}</span>
      {entry.reading.target !== undefined && (
        <span className={styles.target}>/ {entry.reading.target}</span>
      )}
    </p>
  )
}

// The label of the button of the next step, when it lies in this area.
export function nextLabel(
  next: NextStep | undefined,
  area: string,
): string | undefined {
  return next?.area === area ? next.label : undefined
}

// The floating bar that flips between the variants. It is no part of the
// design. The arrow keys flip too.
export function VariantSwitcher({
  current,
  variantHref,
}: {
  current: Variant
  variantHref: (variant: Variant) => string
}) {
  const at = variants.indexOf(current)
  const previous = variants.at(at - 1) ?? current
  const following = variants[(at + 1) % variants.length]

  useEffect(() => {
    const flip = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, [contenteditable]')
      )
        return
      if (event.key === 'ArrowLeft') location.assign(variantHref(previous))
      if (event.key === 'ArrowRight') location.assign(variantHref(following))
    }
    window.addEventListener('keydown', flip)
    return () => window.removeEventListener('keydown', flip)
  }, [previous, following, variantHref])

  if (!import.meta.env.DEV) return null

  return (
    <div className={styles.variants}>
      <a href={variantHref(previous)} aria-label="Previous variant">
        <ArrowLeft />
      </a>
      <span>
        {current} ({variantNames[current]})
      </span>
      <a href={variantHref(following)} aria-label="Next variant">
        <ArrowRight />
      </a>
    </div>
  )
}
