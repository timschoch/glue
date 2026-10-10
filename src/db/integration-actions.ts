import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { integrationSchema } from './integrations.ts'
import type { IntegrationOperations } from './integrations.ts'
import { createSessionGuard, toFailure } from './session-actions.ts'
import type { ActionRequest } from './session-actions.ts'

// The input of the server functions of the Integrations.
export const integrationsInputSchema = z.object({ project: z.string() })

export const integrationAddInputSchema = integrationsInputSchema.extend({
  integration: integrationSchema,
})

export const integrationChangeInputSchema = integrationsInputSchema.extend({
  integrationId: z.int().positive(),
})

type IntegrationsInput = z.infer<typeof integrationsInputSchema>
export type IntegrationAddInput = z.input<typeof integrationAddInputSchema>
export type IntegrationChangeInput = z.infer<
  typeof integrationChangeInputSchema
>

// What the server functions of the Integrations do. Each action looks for
// the session first. A member of the Project adds, pauses, starts and
// removes. `getIntegrations` gives the operations with the tools and the
// secret of the server.
export function createIntegrationActions({
  getIntegrations,
  ...request
}: Pick<ActionRequest, 'findSession' | 'getDb'> & {
  getIntegrations: (db: ConceptDb) => IntegrationOperations
}) {
  const { withSession, withMember } = createSessionGuard(request)

  return {
    listIntegrations: withSession((db, { project }: IntegrationsInput) =>
      getIntegrations(db).list(project),
    ),

    addIntegration: withMember(
      (db, { project, integration }: IntegrationAddInput) =>
        getIntegrations(db)
          .add(project, integration)
          .then(({ id }) => ({ id }), toFailure),
    ),

    pauseIntegration: withMember(
      (db, { project, integrationId }: IntegrationChangeInput) =>
        getIntegrations(db)
          .pause(project, integrationId)
          .then(({ id }) => ({ id }), toFailure),
    ),

    startIntegration: withMember(
      (db, { project, integrationId }: IntegrationChangeInput) =>
        getIntegrations(db)
          .start(project, integrationId)
          .then(({ id }) => ({ id }), toFailure),
    ),

    removeIntegration: withMember(
      (db, { project, integrationId }: IntegrationChangeInput) =>
        getIntegrations(db)
          .remove(project, integrationId)
          .then(() => undefined, toFailure),
    ),
  }
}
