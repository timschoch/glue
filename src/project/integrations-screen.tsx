import { getRouteApi } from '@tanstack/react-router'
import { useState } from 'react'

import type { Integration } from '../db/integrations.ts'
import {
  FailedIntegrations,
  IntegrationForm,
  Integrations,
  integrationFormFields,
} from '../design-system/integrations.tsx'
import { toolNames } from '../signals/integration-tool-names.ts'
import { useProjectLinks } from './use-project-links.ts'
import { useWrite } from './use-write.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// The writes of the Integrations of a list: a member pauses, starts and
// removes each one, and gives it a new key. Each write shows at its row. A
// person who is no member reads only.
function useIntegrationWrites() {
  const { people } = projectRoute.useLoaderData()
  const {
    pauseIntegration,
    startIntegration,
    removeIntegration,
    setIntegrationKey,
  } = projectRoute.useRouteContext()
  const { project } = useProjectLinks()
  const { pending, failure, failurePlace, write } = useWrite()
  const [changed, setChanged] = useState<number>()
  // The Integration that shows the form for a new key.
  const [keyOf, setKeyOf] = useState<number>()
  if (people.me === null) return {}

  const change =
    (name: string, send: typeof pauseIntegration | typeof removeIntegration) =>
    (integrationId: number) => {
      setChanged(integrationId)
      void write(name, () => send({ project, integrationId }))
    }

  return {
    change:
      changed === undefined
        ? undefined
        : { id: changed, pending, failure, field: failurePlace?.field },
    keyOf,
    onPause: change('Pausing', pauseIntegration),
    onStart: change('Starting', startIntegration),
    onRemove: change('Removing', removeIntegration),
    onEditKey: setKeyOf,
    onSetKey: (integrationId: number, key: string) => {
      setChanged(integrationId)
      void write(
        'Saving',
        () => setIntegrationKey({ project, integrationId, key }),
        // The form of a key that saved closes: the key is gone.
        () => Promise.resolve(setKeyOf(undefined)),
      )
    },
  }
}

// The failed Integrations that the person is Responsible for, in Mine. The
// person starts one again or gives it a new key there. A read that works
// takes it out of Mine.
export function FailedIntegrationsSection({
  integrations,
}: {
  integrations: ReadonlyArray<Integration>
}) {
  return (
    <FailedIntegrations
      integrations={integrations}
      {...useIntegrationWrites()}
      onRemove={undefined}
    />
  )
}

// The Integrations of the Project in the main window, in the place of the
// Signals that they bring. A member adds one, and changes each one. A person
// who is no member reads only.
export function IntegrationsScreen({
  integrations,
  onClose,
}: {
  integrations: ReadonlyArray<Integration>
  onClose: () => void
}) {
  const { people } = projectRoute.useLoaderData()
  const { addIntegration } = projectRoute.useRouteContext()
  const { project } = useProjectLinks()
  // The form has its own write: it shows at the form that it saves, or at
  // the field why the server refused it.
  const { pending, failure, failurePlace, write } = useWrite()
  const writes = useIntegrationWrites()
  // A form that saved starts again with no value: the key is gone.
  const [added, setAdded] = useState(0)
  const failedField = integrationFormFields.find(
    (field) => field === failurePlace?.field,
  )
  const isMember = people.me !== null

  return (
    <Integrations integrations={integrations} onClose={onClose} {...writes}>
      {isMember && (
        <IntegrationForm
          key={added}
          tools={toolNames}
          errors={failedField ? { [failedField]: failure } : {}}
          serverError={failedField ? undefined : failure}
          pending={pending}
          onAdd={(integration) =>
            void write(
              'Adding',
              () => addIntegration({ project, integration }),
              () => Promise.resolve(setAdded((count) => count + 1)),
            )
          }
        />
      )}
    </Integrations>
  )
}
