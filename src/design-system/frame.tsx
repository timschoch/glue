import {
  Breadcrumb,
  BreadcrumbItem,
  Content,
  Header,
  SideNav,
  SideNavDivider,
  SideNavItems,
  SideNavLink,
  SideNavMenu,
  SideNavMenuItem,
} from '@carbon/react'
import type { ReactElement, ReactNode } from 'react'

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
// with the sections and the Concepts, the main window with the trail, and the
// right column while a record is pinned.
export function Frame({
  project,
  section,
  concepts,
  conceptPath,
  trail = [],
  pinned = [],
  children,
}: {
  project: string
  section: Section
  concepts: ReadonlyArray<FrameConcept>
  // The open Concept and the Concepts around it, outermost first.
  conceptPath: ReadonlyArray<string>
  // The records opened on the way to the open record, the open record last.
  trail?: ReadonlyArray<string>
  // The pinned records, newest first.
  pinned?: ReadonlyArray<ReactElement>
  children?: ReactNode
}) {
  const isPinned = pinned.length > 0
  const breadcrumb = [project, ...conceptPath]
  const currentConcept = conceptPath.slice(0, PANEL_LEVELS).at(-1)

  return (
    <>
      <Header aria-label="Glue">
        <Breadcrumb noTrailingSlash className={styles.breadcrumb}>
          {breadcrumb.map((name, index) => (
            <BreadcrumbItem
              key={name}
              href="#"
              isCurrentPage={index === breadcrumb.length - 1}
            >
              {name}
            </BreadcrumbItem>
          ))}
        </Breadcrumb>
      </Header>
      <SideNav aria-label="Main" isFixedNav expanded isChildOfHeader={false}>
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
        {trail.length > 0 && (
          <Breadcrumb
            aria-label="Trail"
            noTrailingSlash
            className={styles.trail}
          >
            {trail.map((record, index) => (
              <BreadcrumbItem
                key={record}
                href="#"
                isCurrentPage={index === trail.length - 1}
              >
                {record}
              </BreadcrumbItem>
            ))}
          </Breadcrumb>
        )}
        {children}
      </Content>
      {isPinned && (
        <aside aria-label="Pinned" className={styles.pinned}>
          {pinned}
        </aside>
      )}
    </>
  )
}
