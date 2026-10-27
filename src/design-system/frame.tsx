import { Add, ArrowRight, PinFilled } from '@carbon/icons-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Content,
  Header,
  HeaderMenuButton,
  InlineLoading,
  InlineNotification,
  Layer,
  Link,
  Popover,
  PopoverContent,
  SideNav,
  SideNavDivider,
  SideNavItems,
  SideNavLink,
  SideNavMenu,
  SideNavMenuItem,
} from '@carbon/react'
import { useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

import { AddDropdown } from './add-dropdown.tsx'
import { Card } from './card.tsx'
import type { CardProps } from './card.tsx'
import styles from './frame.module.scss'

// The sections that are a step of the loop, in loop order.
export const loopSections = [
  'Understand',
  'Decide',
  'Design',
  'Build',
  'Use',
] as const

export type LoopSection = (typeof loopSections)[number]

// Mine and People belong to the Project: they are no step of the loop,
// and they do not look like one.
export type Section = LoopSection | 'Mine' | 'People'

// A place the frame links to: its name and its address.
export type FrameLink = { name: string; href: string }

// A Concept of the Project, with the Concepts one level inside it.
export type FrameConcept = FrameLink & { concepts?: ReadonlyArray<FrameLink> }

// A step of the loop for the open Concept: its address, and if the Concept
// has a Part of the step.
export type FrameStep = {
  name: LoopSection
  href: string
  hasParts: boolean
}

// A pinned record: what its minimal card shows.
export type FramePin = Pick<
  CardProps,
  'type' | 'recordId' | 'title' | 'trust' | 'href'
>

export type FrameProps = {
  project: string
  projects: ReadonlyArray<string>
  onProjectChange: (project: string) => void
  // With the callback the switcher ends with the item that adds a Project.
  onAddProject?: () => void
  // With the callback the Concepts end with one button that adds a Concept
  // at the top level.
  onAddConcept?: () => void
  // With the callback the left panel ends with one button that signs out.
  onSignOut?: () => void
  // The sign-out that runs: it shows beside the button.
  signOutPending?: string
  // Why the sign-out failed.
  signOutFailure?: string
  // No section while the main window shows every Part type.
  section?: Section
  mineHref: string
  peopleHref: string
  // The Project itself: the first item of the Concepts.
  rootHref: string
  // The loop steps of the open Concept, above the content, between Mine
  // and People.
  steps: ReadonlyArray<FrameStep>
  // The count of the flags that the person did not see yet, beside Mine.
  // Zero does not show.
  newFlagCount?: number
  concepts: ReadonlyArray<FrameConcept>
  // The open Concept and the Concepts around it, outermost first.
  conceptPath: ReadonlyArray<FrameLink>
  // The records opened on the way to the open record, the open record last.
  // It shows from two records on.
  trail?: ReadonlyArray<FrameLink>
  // The pinned records, newest first.
  pinned?: ReadonlyArray<FramePin>
  onUnpin: (recordId: string) => void
  // A click on a link of the frame, with the address of the link.
  onOpen?: (href: string, event: MouseEvent<HTMLAnchorElement>) => void
  children?: ReactNode
}

// The current marker of a navigation item: Carbon draws the bar, and
// `aria-current` says it without colour.
function current(isCurrent: boolean) {
  return {
    isActive: isCurrent,
    'aria-current': isCurrent ? 'page' : undefined,
  } as const
}

// The frame of every screen: the header with the breadcrumb, the left panel
// with the Project switcher, the Concepts and the sign-out, the main window
// with Mine, the loop steps and People on one line and the trail below it,
// and the right column while a record is pinned. A window too narrow for
// the column shows the count of pins in the trail row, and keeps the left
// panel closed until the menu button of the header opens it.
export function Frame({
  project,
  projects,
  onProjectChange,
  onAddProject,
  onAddConcept,
  onSignOut,
  signOutPending,
  signOutFailure,
  section,
  newFlagCount = 0,
  mineHref,
  peopleHref,
  rootHref,
  steps,
  concepts,
  conceptPath,
  trail = [],
  pinned = [],
  onUnpin,
  onOpen,
  children,
}: FrameProps) {
  // In a narrow window the stack of pinned records opens over the main window.
  const [stackOpen, setStackOpen] = useState(false)
  // In a narrow window the left panel opens over the main window.
  const [panelOpen, setPanelOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const isPinned = pinned.length > 0
  // One record is no trail: the record shows its title itself.
  const hasTrail = trail.length > 1
  const link = (href: string) => ({
    href,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => onOpen?.(href, event),
  })
  const cards = pinned.map((pin) => (
    <Card
      key={pin.recordId}
      {...pin}
      minimal
      onOpen={(event) => onOpen?.(pin.href, event)}
      action={{
        label: 'Unpin',
        icon: PinFilled,
        onClick: () => onUnpin(pin.recordId),
      }}
    />
  ))
  const isOnPath = (concept: FrameLink) =>
    conceptPath.some(({ href }) => href === concept.href)
  // Mine and People are of the Project: while one is open, no Concept is.
  const showsConcept = section !== 'Mine' && section !== 'People'
  // The left panel shows two levels of Concepts. The current one is the
  // innermost Concept of the path that the panel shows: a link, or the
  // title of a menu. The Project itself is current while the path has no
  // Concept of the panel.
  const currentConcept = showsConcept
    ? (concepts
        .flatMap((concept) => [concept, ...(concept.concepts ?? [])])
        .filter(isOnPath)
        .at(-1)?.href ?? rootHref)
    : undefined

  return (
    <>
      <div
        // In the capture phase: Carbon's Dropdown keeps Escape to itself.
        onKeyDownCapture={({ key }) => {
          if (key !== 'Escape' || !panelOpen) return
          setPanelOpen(false)
          menuButton.current?.focus()
        }}
        // A focus that leaves the header and its panel is a click outside.
        onBlur={({ currentTarget, relatedTarget }) => {
          if (!currentTarget.contains(relatedTarget)) setPanelOpen(false)
        }}
      >
        <Header aria-label="Glue">
          <HeaderMenuButton
            ref={menuButton}
            aria-label="Menu"
            aria-expanded={panelOpen}
            isActive={panelOpen}
            onClick={() => setPanelOpen((open) => !open)}
          />
          <Breadcrumb noTrailingSlash className={styles.breadcrumb}>
            {conceptPath.map(({ name, href }, index) => (
              <BreadcrumbItem
                key={href}
                isCurrentPage={index === conceptPath.length - 1}
              >
                <a {...link(href)}>{name}</a>
              </BreadcrumbItem>
            ))}
          </Breadcrumb>
          <SideNav
            aria-label="Main"
            expanded={panelOpen}
            onOverlayClick={() => setPanelOpen(false)}
            // A choice in the panel closes it.
            onClick={({ target }) => {
              if (target instanceof Element && target.closest('a')) {
                setPanelOpen(false)
              }
            }}
          >
            <Layer className={styles.switcher}>
              <AddDropdown
                id="project"
                label="Project"
                hideLabel
                options={projects.map((name) => ({ value: name, name }))}
                value={project}
                thing="Project"
                onChange={(name) => {
                  onProjectChange(name)
                  setPanelOpen(false)
                }}
                onAdd={
                  onAddProject &&
                  (() => {
                    onAddProject()
                    setPanelOpen(false)
                  })
                }
              />
            </Layer>
            <SideNavItems>
              <SideNavLink
                {...link(rootHref)}
                {...current(rootHref === currentConcept)}
              >
                Concept
              </SideNavLink>
              {concepts.map((concept) =>
                concept.concepts ? (
                  <SideNavMenu
                    // A Concept that comes onto the path opens its menu.
                    key={`${concept.href} ${isOnPath(concept)}`}
                    title={concept.name}
                    defaultExpanded={isOnPath(concept)}
                    {...current(concept.href === currentConcept)}
                    className={
                      concept.href === currentConcept
                        ? styles.currentMenu
                        : undefined
                    }
                  >
                    {concept.concepts.map(({ name, href }) => (
                      <SideNavMenuItem
                        key={href}
                        {...link(href)}
                        {...current(href === currentConcept)}
                      >
                        {name}
                      </SideNavMenuItem>
                    ))}
                  </SideNavMenu>
                ) : (
                  <SideNavLink
                    key={concept.href}
                    {...link(concept.href)}
                    {...current(concept.href === currentConcept)}
                  >
                    {concept.name}
                  </SideNavLink>
                ),
              )}
              {onAddConcept && (
                <li>
                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={Add}
                    onClick={() => {
                      onAddConcept()
                      setPanelOpen(false)
                    }}
                  >
                    Add Concept
                  </Button>
                </li>
              )}
              {onSignOut && <SideNavDivider />}
              {onSignOut && (
                <li>
                  {/* The button stays while the sign-out runs: it keeps
                      the keyboard focus, and it says itself that the
                      sign-out runs. */}
                  <Button
                    kind="ghost"
                    size="sm"
                    aria-disabled={signOutPending !== undefined}
                    onClick={
                      signOutPending === undefined ? onSignOut : undefined
                    }
                  >
                    {signOutPending === undefined ? (
                      'Sign out'
                    ) : (
                      <InlineLoading
                        description={signOutPending}
                        className={styles.signOutPending}
                      />
                    )}
                  </Button>
                  {signOutFailure !== undefined && (
                    <InlineNotification
                      kind="error"
                      role="alert"
                      lowContrast
                      title={signOutFailure}
                      className={styles.signOutFailure}
                    />
                  )}
                </li>
              )}
            </SideNavItems>
          </SideNav>
        </Header>
      </div>
      <Content
        className={
          isPinned ? `${styles.content} ${styles.besidePinned}` : styles.content
        }
      >
        <nav aria-label="Sections" className={styles.sections}>
          <a
            {...link(mineHref)}
            aria-current={section === 'Mine' ? 'page' : undefined}
            className={styles.section}
          >
            {newFlagCount > 0 ? `Mine ${newFlagCount}` : 'Mine'}
          </a>
          <ol aria-label="Loop" className={styles.steps}>
            {steps.map(({ name, href, hasParts }, index) => (
              <li key={name} className={styles.step}>
                <a
                  {...link(href)}
                  aria-current={name === section ? 'step' : undefined}
                  // The border says it to the eye, this to a screen reader.
                  aria-description={hasParts ? undefined : 'No Parts'}
                  className={hasParts ? styles.filled : styles.empty}
                >
                  {name}
                </a>
                {index === steps.length - 1 && (
                  <ArrowRight className={styles.glyph} />
                )}
              </li>
            ))}
          </ol>
          <a
            {...link(peopleHref)}
            aria-current={section === 'People' ? 'page' : undefined}
            className={styles.section}
          >
            People
          </a>
        </nav>
        {(hasTrail || isPinned) && (
          <div className={styles.trail}>
            {hasTrail && (
              <nav aria-label="Trail">
                <ol className={styles.records}>
                  {trail.map(({ name, href }, index) => (
                    <li key={href} className={styles.record}>
                      {index > 0 && <ArrowRight className={styles.glyph} />}
                      {index === trail.length - 1 ? (
                        <span aria-current="page">{name}</span>
                      ) : (
                        <Link {...link(href)}>{name}</Link>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>
            )}
            {isPinned && (
              <Popover
                open={stackOpen}
                align="bottom-end"
                caret={false}
                backgroundToken="background"
                onRequestClose={() => setStackOpen(false)}
                // Carbon closes on Escape only while the focus is in the stack.
                onKeyDown={({ key }) => {
                  if (key === 'Escape') setStackOpen(false)
                }}
                className={styles.pinCount}
              >
                <Button
                  kind="ghost"
                  size="sm"
                  renderIcon={PinFilled}
                  aria-label={`${pinned.length} pinned`}
                  aria-expanded={stackOpen}
                  onClick={() => setStackOpen((open) => !open)}
                >
                  {pinned.length}
                </Button>
                <PopoverContent>
                  <div className={styles.stack}>{cards}</div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}
        {children}
      </Content>
      {isPinned && (
        <aside aria-label="Pinned" className={styles.pinned}>
          {cards}
        </aside>
      )}
    </>
  )
}

// The frame of a screen that has no Project: the canvas alone.
export function PlainFrame({ children }: { children?: ReactNode }) {
  return <Content className={styles.canvas}>{children}</Content>
}
