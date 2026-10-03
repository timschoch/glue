import { ArrowRight, PinFilled } from '@carbon/icons-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Content,
  Dropdown,
  Header,
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
import { useState } from 'react'
import type { ReactNode } from 'react'

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

// A Concept of the Project, with the names of the Concepts one level inside it.
export type FrameConcept = { name: string; concepts?: ReadonlyArray<string> }

// The left panel shows two levels of Concepts.
const PANEL_LEVELS = 2

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
// too narrow for the column shows the count of pins in the trail row.
export function Frame({
  project,
  projects,
  onProjectChange,
  section,
  concepts,
  conceptPath,
  trail = [],
  pinned = [],
  children,
}: {
  project: string
  projects: ReadonlyArray<string>
  onProjectChange: (project: string) => void
  section: Section
  concepts: ReadonlyArray<FrameConcept>
  // The open Concept and the Concepts around it, outermost first.
  conceptPath: ReadonlyArray<string>
  // The records opened on the way to the open record, the open record last.
  trail?: ReadonlyArray<string>
  // The pinned records, newest first.
  pinned?: ReadonlyArray<string>
  children?: ReactNode
}) {
  // In a narrow window the stack of pinned records opens over the main window.
  const [stackOpen, setStackOpen] = useState(false)
  const isPinned = pinned.length > 0
  const cards = pinned.map((record) => (
    <a key={record} href="#" className={styles.card}>
      <PinFilled aria-label="Pinned" className={styles.glyph} />
      {record}
    </a>
  ))
  const currentConcept = conceptPath.slice(0, PANEL_LEVELS).at(-1)

  return (
    <>
      <Header aria-label="Glue">
        <Breadcrumb noTrailingSlash className={styles.breadcrumb}>
          {conceptPath.map((name, index) => (
            <BreadcrumbItem
              key={name}
              href="#"
              isCurrentPage={index === conceptPath.length - 1}
            >
              {name}
            </BreadcrumbItem>
          ))}
        </Breadcrumb>
      </Header>
      <SideNav aria-label="Main" isFixedNav expanded isChildOfHeader={false}>
        <Layer className={styles.switcher}>
          <Dropdown
            id="project"
            titleText="Project"
            hideLabel
            label="Project"
            items={[...projects]}
            selectedItem={project}
            onChange={({ selectedItem }) => {
              if (selectedItem) onProjectChange(selectedItem)
            }}
          />
        </Layer>
        <SideNavItems>
          {sections.map((name) => (
            <SideNavLink key={name} href="#" {...current(name === section)}>
              {name}
            </SideNavLink>
          ))}
          <SideNavDivider />
          {concepts.map((concept) =>
            concept.concepts ? (
              <SideNavMenu
                key={concept.name}
                title={concept.name}
                defaultExpanded={conceptPath.includes(concept.name)}
              >
                {concept.concepts.map((name) => (
                  <SideNavMenuItem
                    key={name}
                    href="#"
                    {...current(name === currentConcept)}
                  >
                    {name}
                  </SideNavMenuItem>
                ))}
              </SideNavMenu>
            ) : (
              <SideNavLink
                key={concept.name}
                href="#"
                {...current(concept.name === currentConcept)}
              >
                {concept.name}
              </SideNavLink>
            ),
          )}
        </SideNavItems>
      </SideNav>
      <Content
        className={
          isPinned ? `${styles.content} ${styles.besidePinned}` : styles.content
        }
      >
        {(trail.length > 0 || isPinned) && (
          <div className={styles.trail}>
            <nav aria-label="Trail">
              <ol className={styles.records}>
                {trail.map((record, index) => (
                  <li key={record} className={styles.record}>
                    {index > 0 && <ArrowRight className={styles.glyph} />}
                    {index === trail.length - 1 ? (
                      <span aria-current="page">{record}</span>
                    ) : (
                      <Link href="#">{record}</Link>
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
                  <Layer className={styles.stack}>{cards}</Layer>
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
