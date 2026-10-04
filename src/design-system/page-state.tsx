import { Link, SkeletonPlaceholder, SkeletonText } from '@carbon/react'

import styles from './page-state.module.scss'

// The count of cards that a page shows while it loads.
const SKELETON_CARD_COUNT = 6

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

// What the main window shows while a page loads for the first time: the
// title and the cards of a Concept view, as skeletons in their place.
export function PageSkeleton() {
  return (
    <div aria-busy="true" className={styles.skeleton}>
      <SkeletonText heading className={styles.skeletonTitle} />
      <div className={styles.skeletonCards}>
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
          <SkeletonPlaceholder key={index} className={styles.skeletonCard} />
        ))}
      </div>
    </div>
  )
}
