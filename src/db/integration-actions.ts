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

export const integrationKeyInputSchema = integrationChangeInputSchema.extend({
  key: integrationSchema.shape.key,
})

type IntegrationsInput = z.infer<typeof integrationsInputSchema>
export type IntegrationKeyInput = z.input<typeof integrationKeyInputSchema>
export type IntegrationAddInput = z.input<typeof integrationAddInputSchema>
export type IntegrationChangeInput = z.infer<
  typeof integrationChangeInputSchema
>

// What the server functions of the Integrations do. Each action looks for
// the session first. A member of the Project adds, pauses, starts and
// removes, and gives a new key. The member who adds an Integration is its
// Responsible. `getIntegrations` gives the operations with the tools and
// the secret of the server.
export function createIntegrationActions({
  getIntegrations,
  ...request
}: Pick<ActionRequest, 'findSession' | 'getDb'> & {
  getIntegrations: (db: ConceptDb) => IntegrationOperations
}) {
  const { withSession, withReader, withMember } = createSessionGuard(request)

  return {
    listIntegrations: withSession((db, { project }: IntegrationsInput) =>
      getIntegrations(db).list(project),
    ),

    // The failed Integrations that the person is Responsible for. A person
    // who is no member has none.
    listMineIntegrations: withReader(
      async (db, { project }: IntegrationsInput, member) =>
        member ? getIntegrations(db).listMine(project, member.email) : [],
    ),

    addIntegration: withMember(
      (db, { project, integration }: IntegrationAddInput, member) =>
        getIntegrations(db)
          .add(project, integration, member.email)
          .then(({ id }) => ({ id }), toFailure),
    ),

    setIntegrationKey: withMember(
      (db, { project, integrationId, key }: IntegrationKeyInput) =>
        getIntegrations(db)
          .setKey(project, integrationId, key)
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
