// The HTTP API of the Contract of a Concept (D28): a coding agent reads the
// newest Contract Version, and a member signs off the next one. The schemas
// here document the answers in openapi.ts.
import { z } from 'zod'

import { findContract, signContract } from '../db/contracts.ts'
import type { Contract, FrozenPart } from '../db/contracts.ts'
import { evidenceLevels, partTypes } from '../db/parts.ts'
import { ApiError, handleApiRequest, parseJson } from './api-request.ts'
import type { ApiRequest } from './api-request.ts'

const frozenPartSchema = z
  .object({
    id: z.string().meta({ description: 'The record id, like F2' }),
    type: z.enum(partTypes),
    title: z.string(),
    body: z.string(),
    concept: z.string().meta({ description: 'The slug of the home Concept' }),
    status: z.string().nullable(),
    owner: z.string().nullable(),
    date: z.iso.date().nullable(),
    source: z.string().nullable(),
    metric: z.string().nullable(),
    enforcedBy: z.string().nullable(),
    evidenceLevel: z.enum(evidenceLevels).nullable(),
    needs: z.array(z.string()).meta({
      description: 'The record ids of the Parts that it needs',
    }),
  })
  .meta({
    id: 'FrozenPart',
    description: 'A Part as it was at the sign-off',
  }) satisfies z.ZodType<FrozenPart>

export const contractSchema = z
  .object({
    concept: z.string().meta({ description: 'The slug of the Concept' }),
    title: z.string(),
    kind: z
      .string()
      .nullable()
      .meta({ description: 'The slug of the Kind of the Concept' }),
    version: z.number(),
    newestVersion: z.number().meta({
      description: 'A higher number than `version`: this Version is superseded',
    }),
    checksum: z
      .string()
      .meta({ description: 'The SHA-256 of the frozen Parts' }),
    signedBy: z.string(),
    signedAt: z.iso.datetime(),
    tier1: z.array(frozenPartSchema).meta({
      description: 'What to build: the Flows, the Entities and the Guardrails',
    }),
    tier2: z.array(frozenPartSchema).meta({
      description:
        'The why: the Insights, the Goals, the Decisions and the Metrics',
    }),
    slots: z
      .array(
        z.object({
          type: z.enum(partTypes),
          required: z.boolean(),
          filled: z.boolean(),
        }),
      )
      .meta({
        description:
          'One slot per Part type of the Kind. A slot is filled when the Version holds a Part of its type',
      }),
  })
  .meta({ id: 'Contract' }) satisfies z.ZodType<Contract>

export const contractSignInputSchema = z
  .strictObject({
    signedBy: z.string().trim().min(1).meta({
      description: 'The name of who signs off',
    }),
  })
  .meta({ id: 'ContractSignInput' })

export const contractVersionQuerySchema = z.coerce.number().int().positive()

export function handleGetContract(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const { project, concept = '' } = params
    const sent = new URL(request.url).searchParams.get('version')
    const version =
      sent === null ? undefined : contractVersionQuerySchema.parse(sent)
    const contract = await findContract(db, project, concept, version)
    if (!contract) {
      throw new ApiError(
        'not-found',
        version === undefined
          ? `"${concept}" has no Contract Version`
          : `"${concept}" has no Contract Version ${version}`,
      )
    }
    return Response.json(contract)
  })
}

export function handleSignContract(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const { project, concept = '' } = params
    const { signedBy } = contractSignInputSchema.parse(await parseJson(request))
    const version = await signContract(db, project, concept, signedBy)
    return Response.json(await findContract(db, project, concept, version), {
      status: 201,
    })
  })
}
