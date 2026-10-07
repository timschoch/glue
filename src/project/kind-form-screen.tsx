import { getRouteApi } from '@tanstack/react-router'
import { useState } from 'react'

import { KindForm } from '../design-system/kind-form.tsx'
import { toSlug } from './name-form-screen.tsx'
import { useProjectLinks } from './use-project-links.ts'
import { useWrite } from './use-write.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// The form in the main window that adds a Kind to the Project, or changes
// the Kind of the slug. A new Kind gets its slug from its name. After the
// save the screen shows the Concept again.
export function KindFormScreen({ slug }: { slug?: string }) {
  const { kinds } = projectRoute.useLoaderData().project
  const { addKind, updateKind } = projectRoute.useRouteContext()
  const { project, search, changeSearch } = useProjectLinks()
  const { pending, failure, write } = useWrite()
  const [error, setError] = useState<string>()
  const close = () =>
    changeSearch({ ...search, add: undefined, kind: undefined })

  return (
    <KindForm
      kind={kinds.find((kind) => kind.slug === slug)}
      error={error}
      serverError={failure}
      pending={pending !== undefined}
      onCancel={() => void close()}
      onSave={({ name, slots }) => {
        if (slug !== undefined) {
          void write(
            'Saving',
            () => updateKind({ project, kind: slug, change: { name, slots } }),
            close,
          )
          return
        }
        const added = toSlug(name)
        setError(added === '' ? 'Enter a name with a letter.' : undefined)
        if (added === '') return
        void write(
          'Saving',
          () => addKind({ project, kind: { slug: added, name, slots } }),
          close,
        )
      }}
    />
  )
}
