import { getRouteApi } from '@tanstack/react-router'
import { useState } from 'react'

import type { ProjectIntegrations } from '../db/integration-actions.ts'
import {
  FailedIntegrations,
  IntegrationForm,
  IntegrationSecret,
  Integrations,
  integrationFormFields,
} from '../design-system/integrations.tsx'
import { useProjectLinks } from './use-project-links.ts'
import { useWrite } from './use-write.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// The Integrations as a list shows them: each one with the label of its
// tool. `tools` says what each tool of the server is: the screen names no
// tool itself.
const toRows = ({ tools, integrations }: ProjectIntegrations) =>
  integrations.map((integration) => ({
    ...integration,
    tool:
      tools.find(({ name }) => name === integration.tool)?.label ??
      integration.tool,
  }))

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
  // The Integration of the last write. `isKey`: the form of the new key
  // started it, so the write shows in that form.
  const [changed, setChanged] = useState<{ id: number; isKey: boolean }>()
  // The Integration that shows the form for a new key.
  const [keyOf, setKeyOf] = useState<number>()
  if (people.me === null) return {}

  const change =
    (name: string, send: typeof pauseIntegration | typeof removeIntegration) =>
    (integrationId: number) => {
      setChanged({ id: integrationId, isKey: false })
      void write(name, () => send({ project, integrationId }))
    }

  return {
    change:
      changed === undefined
        ? undefined
        : {
            id: changed.id,
            pending,
            failure,
            field: failurePlace?.field,
            isKey: changed.isKey,
          },
    keyOf,
    onPause: change('Pausing', pauseIntegration),
    onStart: change('Starting', startIntegration),
    onRemove: change('Removing', removeIntegration),
    onEditKey: (integrationId?: number) => {
      setKeyOf(integrationId)
      // A form that closes takes its refused key with it.
      if (changed?.isKey) setChanged(undefined)
    },
    onSetKey: (integrationId: number, key: string) => {
      setChanged({ id: integrationId, isKey: true })
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
export function FailedIntegrationsSection(failed: ProjectIntegrations) {
  return (
    <FailedIntegrations
      integrations={toRows(failed)}
      {...useIntegrationWrites()}
      onRemove={undefined}
    />
  )
}

// The Integrations of the Project in the main window, in the place of the
// Signals that they bring. A member adds one, and changes each one. A person
// who is no member reads only. `tools` says what each tool asks of a member.
export function IntegrationsScreen({
  tools,
  integrations,
  onClose,
}: ProjectIntegrations & {
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
  // The last add that Glue made a secret for. It shows until the next add,
  // or until the person leaves the screen.
  const [made, setMade] = useState<{ name: string; secret: string }>()
  const toLabel = (tool: string) =>
    tools.find(({ name }) => name === tool)?.label ?? tool
  const failedField = integrationFormFields.find(
    (field) => field === failurePlace?.field,
  )
  const isMember = people.me !== null

  return (
    <Integrations
      integrations={toRows({ tools, integrations })}
      onClose={onClose}
      {...writes}
    >
      {made && (
        <IntegrationSecret
          name={made.name}
          address={`${window.location.origin}/api/v1/projects/${project}/webhook`}
          secret={made.secret}
        />
      )}
      {isMember && tools.length > 0 && (
        <IntegrationForm
          key={added}
          tools={tools}
          errors={failedField ? { [failedField]: failure } : {}}
          serverError={failedField ? undefined : failure}
          pending={pending}
          onAdd={(integration) =>
            void write(
              'Adding',
              () => addIntegration({ project, integration }),
              ({ secret }) => {
                setMade(
                  secret
                    ? {
                        name: `${toLabel(integration.tool)} ${integration.address}`,
                        secret,
                      }
                    : undefined,
                )
                setAdded((count) => count + 1)
                return Promise.resolve()
              },
            )
          }
        />
      )}
    </Integrations>
  )
}
