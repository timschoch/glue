import { ArrowRight, PinFilled } from '@carbon/icons-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Content,
  Dropdown,
  Header,
  HeaderMenuButton,
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

import { Card } from './card.tsx'
import type { CardProps } from './card.tsx'
import styles from './frame.module.scss'

export const sections = [
  'Mine',
  'Understand',
  'Decide',
  'Design',
  'Build',
  'Use',
  'People',
] as const

export type Section = (typeof sections)[number]

// A place the frame links to: its name and its address.
export type FrameLink = { name: string; href: string }

// A Concept of the Project, with the Concepts one level inside it.
export type FrameConcept = FrameLink & { concepts?: ReadonlyArray<FrameLink> }

// A pinned record: what its minimal card shows.
export type FramePin = Pick<
  CardProps,
  'type' | 'recordId' | 'title' | 'trust' | 'href'
>

export type FrameProps = {
  project: string
  projects: ReadonlyArray<string>
  onProjectChange: (project: string) => void
  // No section while the main window shows every Part type.
  section?: Section
  sectionHref: (section: Section) => string
  concepts: ReadonlyArray<FrameConcept>
  // The open Concept and the Concepts around it, outermost first.
  conceptPath: ReadonlyArray<FrameLink>
  // The records opened on the way to the open record, the open record last.
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
// with the Project switcher, the sections and the Concepts, the main window
// with the trail, and the right column while a record is pinned. A window
// too narrow for the column shows the count of pins in the trail row, and
// keeps the left panel closed until the menu button of the header opens it.
export function Frame({
  project,
  projects,
  onProjectChange,
  section,
  sectionHref,
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
  // The left panel shows two levels of Concepts. The current one is the
  // innermost Concept of the path that the panel has a link for.
  const currentConcept = concepts
    .flatMap((concept) => concept.concepts ?? [concept])
    .filter(isOnPath)
    .at(-1)?.href

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
              <Dropdown
                id="project"
                titleText="Project"
                hideLabel
                label="Project"
                items={[...projects]}
                selectedItem={project}
                onChange={({ selectedItem }) => {
                  if (!selectedItem) return
                  onProjectChange(selectedItem)
                  setPanelOpen(false)
                }}
              />
            </Layer>
            <SideNavItems>
              {sections.map((name) => (
                <SideNavLink
                  key={name}
                  {...link(sectionHref(name))}
                  {...current(name === section)}
                >
                  {name}
                </SideNavLink>
              ))}
              <SideNavDivider />
              {concepts.map((concept) =>
                concept.concepts ? (
                  <SideNavMenu
                    // A Concept that comes onto the path opens its menu.
                    key={`${concept.href} ${isOnPath(concept)}`}
                    title={concept.name}
                    defaultExpanded={isOnPath(concept)}
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
            </SideNavItems>
          </SideNav>
        </Header>
      </div>
      <Content
        className={
          isPinned ? `${styles.content} ${styles.besidePinned}` : styles.content
        }
      >
        {(trail.length > 0 || isPinned) && (
          <div className={styles.trail}>
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
