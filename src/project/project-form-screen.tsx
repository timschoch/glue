import { TextInput } from '@carbon/react'
import { getRouteApi, useRouter } from '@tanstack/react-router'
import { useId, useState } from 'react'

import { NameForm } from '../design-system/name-form.tsx'
import { useProjectLinks } from './use-project-links.ts'
import { useWrite } from './use-write.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// The form in the main window that renames the Project: its name and its
// address. The server has the rule of an address, and its reason shows at
// the field that it names. After the save the screen shows the Project at
// its new address.
export function ProjectFormScreen() {
  const router = useRouter()
  const { name, slug } = projectRoute.useLoaderData().project
  const { renameProject } = projectRoute.useRouteContext()
  const { project, search, changeSearch } = useProjectLinks()
  const { pending, failure, failurePlace, write } = useWrite()
  const addressId = useId()
  const [address, setAddress] = useState(slug)
  const reasonOf = (field: string) =>
    failurePlace?.field === field ? failure : undefined
  const nameError = reasonOf('name')
  const addressError = reasonOf('slug')

  return (
    <NameForm
      heading="Project"
      label="Name"
      value={name}
      error={nameError}
      serverError={(nameError ?? addressError) ? undefined : failure}
      pending={pending !== undefined}
      onCancel={() => void changeSearch({ ...search, edit: undefined })}
      onSave={(nextName) =>
        void write(
          'Saving',
          () =>
            renameProject({
              project,
              change: { name: nextName, slug: address.trim() },
            }),
          (saved) =>
            router.navigate({
              to: '/$project',
              params: { project: saved.slug },
            }),
        )
      }
    >
      <TextInput
        id={addressId}
        labelText="Address"
        invalid={addressError !== undefined}
        invalidText={addressError}
        // Carbon names the reason only as the error message of the input. A
        // screen reader needs it as the description too.
        aria-describedby={
          addressError === undefined ? undefined : `${addressId}-error-msg`
        }
        value={address}
        onChange={({ target }) => setAddress(target.value)}
      />
    </NameForm>
  )
}
