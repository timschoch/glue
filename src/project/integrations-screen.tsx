import { getRouteApi } from '@tanstack/react-router'
import { useState } from 'react'

import type { Integration } from '../db/integrations.ts'
import {
  IntegrationForm,
  Integrations,
  integrationFormFields,
} from '../design-system/integrations.tsx'
import { toolNames } from '../signals/integration-tool-names.ts'
import { useProjectLinks } from './use-project-links.ts'
import { useWrite } from './use-write.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// The Integrations of the Project in the main window, in the place of the
// Signals that they bring. A member adds one, and pauses, starts and removes
// each one. A person who is no member reads only.
export function IntegrationsScreen({
  integrations,
  onClose,
}: {
  integrations: ReadonlyArray<Integration>
  onClose: () => void
}) {
  const { people } = projectRoute.useLoaderData()
  const {
    addIntegration,
    pauseIntegration,
    startIntegration,
    removeIntegration,
  } = projectRoute.useRouteContext()
  const { project } = useProjectLinks()
  // The form has its own write: it shows at the form that it saves, or at
  // the field why the server refused it.
  const { pending, failure, failurePlace, write } = useWrite()
  // The write of one Integration shows at its row.
  const {
    pending: changePending,
    failure: changeFailure,
    write: writeChange,
  } = useWrite()
  const [changed, setChanged] = useState<number>()
  // A form that saved starts again with no value: the key is gone.
  const [added, setAdded] = useState(0)
  const failedField = integrationFormFields.find(
    (field) => field === failurePlace?.field,
  )
  const isMember = people.me !== null

  const change = (
    name: string,
    send: typeof pauseIntegration | typeof removeIntegration,
  ) =>
    isMember
      ? (integrationId: number) => {
          setChanged(integrationId)
          void writeChange(name, () => send({ project, integrationId }))
        }
      : undefined

  return (
    <Integrations
      integrations={integrations.map(({ lastRead, ...integration }) => ({
        ...integration,
        error: lastRead?.error,
      }))}
      change={
        changed === undefined
          ? undefined
          : { id: changed, pending: changePending, failure: changeFailure }
      }
      onPause={change('Pausing', pauseIntegration)}
      onStart={change('Starting', startIntegration)}
      onRemove={change('Removing', removeIntegration)}
      onClose={onClose}
    >
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
