import { getRouteApi, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { NameForm } from '../design-system/name-form.tsx'
import { useProjectLinks } from './use-project-links.ts'
import { useWrite } from './use-write.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

// The slug of a title: its words in lowercase, joined by hyphens.
export function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// The form in the main window that adds a Concept below the open Concept,
// or a Project. A Concept gets its slug from its title. A Project gets its
// name from its slug.
export function NameFormScreen({ added }: { added: 'concept' | 'project' }) {
  const router = useRouter()
  const { addConcept, addProject } = projectRoute.useRouteContext()
  const { project, concept, search, conceptHref, changeSearch } =
    useProjectLinks()
  const { pending, failure, write } = useWrite()
  const [error, setError] = useState<string>()
  const shared = {
    error,
    serverError: failure,
    pending: pending !== undefined,
    onCancel: () => void changeSearch({ ...search, add: undefined }),
  }

  if (added === 'project') {
    return (
      <NameForm
        {...shared}
        heading="Project"
        label="Slug"
        placeholder="my-project"
        onSave={(slug) => {
          const wrong = !SLUG.test(slug)
          setError(wrong ? 'Enter a slug, such as my-project.' : undefined)
          if (wrong) return
          void write(
            'Saving',
            () => addProject({ slug }),
            (saved) =>
              router.navigate({
                to: '/$project',
                params: { project: saved.slug },
              }),
          )
        }}
      />
    )
  }

  return (
    <NameForm
      {...shared}
      heading="Concept"
      label="Title"
      onSave={(title) => {
        const slug = toSlug(title)
        setError(slug === '' ? 'Enter a title with a letter.' : undefined)
        if (slug === '') return
        void write(
          'Saving',
          () =>
            addConcept({ project, concept: { slug, title, parent: concept } }),
          (saved) =>
            router.navigate({
              href: conceptHref(saved.slug, {
                section: search.section,
                pins: search.pins,
              }),
            }),
        )
      }}
    />
  )
}
