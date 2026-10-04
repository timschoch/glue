import { Link } from '@carbon/react'

import styles from './page-state.module.scss'

// What the main window shows in place of a page that is not there or did
// not load: plain words as the page title, and at most one link that leads
// on.
export function PageState({
  title,
  link,
}: {
  title: string
  link?: { name: string; href: string }
}) {
  return (
    <div className={styles.state}>
      <h1 className={styles.title}>{title}</h1>
      {link && <Link href={link.href}>{link.name}</Link>}
    </div>
  )
}
