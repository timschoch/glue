// The OpenAPI document of the Concept HTTP API, built from the same schemas
// that validate the requests. No hand-written copy.
import { z } from 'zod'
import { createDocument } from 'zod-openapi'

import {
  conceptSchema,
  conceptSummarySchemas,
  decisionSchema,
  factSchema,
  goalSchema,
  guardrailSchema,
  insightSchema,
} from '../db/concept.ts'
import type { ConceptFolder } from '../db/concept-records.ts'
import {
  errorSchema,
  inputSchemas,
  measureResultSchema,
  updateSchemas,
} from './concept-api.ts'

const PRODUCT_PATH = '/api/v1/products/{product}'

type FolderSchemas = {
  // One record, as operation ids name it: getGoal, addInsight.
  name: string
  record: z.ZodType
  summary: z.ZodType
  input?: z.ZodType
  update?: z.ZodType
}

const folders: Record<ConceptFolder, FolderSchemas> = {
  goals: {
    name: 'Goal',
    record: goalSchema,
    summary: conceptSummarySchemas.goals,
    input: inputSchemas.goals,
    update: updateSchemas.goals,
  },
  decisions: {
    name: 'Decision',
    record: decisionSchema,
    summary: conceptSummarySchemas.decisions,
    input: inputSchemas.decisions,
    update: updateSchemas.decisions,
  },
  insights: {
    name: 'Insight',
    record: insightSchema,
    summary: conceptSummarySchemas.insights,
    input: inputSchemas.insights,
  },
  facts: {
    name: 'Fact',
    record: factSchema,
    summary: conceptSummarySchemas.facts,
    input: inputSchemas.facts,
  },
  guardrails: {
    name: 'Guardrail',
    record: guardrailSchema,
    summary: conceptSummarySchemas.guardrails,
  },
}

const product = z.string().meta({ description: 'The slug of the Product' })
const recordId = z.string().meta({ description: 'A record id, like D12' })

function jsonContent(schema: z.ZodType) {
  return { content: { 'application/json': { schema } } }
}

const errorResponses = {
  400: {
    description: 'The request breaks a rule',
    ...jsonContent(errorSchema),
  },
  401: { description: 'No valid token', ...jsonContent(errorSchema) },
  404: {
    description: 'Not found, or another Product',
    ...jsonContent(errorSchema),
  },
  409: {
    description: 'Another request took the same id',
    ...jsonContent(errorSchema),
  },
}

const readErrorResponses = {
  401: errorResponses[401],
  404: errorResponses[404],
}

const folderPaths = Object.entries(folders).map(
  ([folder, { name, record, summary, input, update }]) => ({
    [`${PRODUCT_PATH}/${folder}`]: {
      get: {
        operationId: `list${name}s`,
        summary: `List the ${folder} of the Product`,
        requestParams: { path: z.object({ product }) },
        responses: {
          200: {
            description: `The ${folder}`,
            ...jsonContent(z.array(summary)),
          },
          ...readErrorResponses,
        },
      },
      ...(input && {
        post: {
          operationId: `add${name}`,
          summary: `Add to the ${folder} of the Product`,
          requestParams: { path: z.object({ product }) },
          requestBody: jsonContent(input),
          responses: {
            201: { description: 'The new record', ...jsonContent(record) },
            ...errorResponses,
          },
        },
      }),
    },
    [`${PRODUCT_PATH}/${folder}/{recordId}`]: {
      get: {
        operationId: `get${name}`,
        summary: `Read one of the ${folder} with its links`,
        requestParams: { path: z.object({ product, recordId }) },
        responses: {
          200: { description: 'The record', ...jsonContent(record) },
          ...readErrorResponses,
        },
      },
      ...(update && {
        patch: {
          operationId: `update${name}`,
          summary: `Change one of the ${folder}`,
          requestParams: { path: z.object({ product, recordId }) },
          requestBody: jsonContent(update),
          responses: {
            200: { description: 'The changed record', ...jsonContent(record) },
            400: errorResponses[400],
            ...readErrorResponses,
          },
        },
      }),
    },
  }),
)

const openApiDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'Glue Concept API',
    version: '1',
    description:
      'Read and add to the Concept of one Product. A token opens one Product only.',
  },
  // The paths start at the root of the Glue app.
  servers: [{ url: '/' }],
  security: [{ token: [] }],
  components: {
    securitySchemes: { token: { type: 'http', scheme: 'bearer' } },
  },
  paths: Object.assign(
    {
      [`${PRODUCT_PATH}/concept`]: {
        get: {
          operationId: 'getConcept',
          summary: 'Read the whole Concept of the Product',
          requestParams: { path: z.object({ product }) },
          responses: {
            200: { description: 'The Concept', ...jsonContent(conceptSchema) },
            ...readErrorResponses,
          },
        },
      },
      [`${PRODUCT_PATH}/measure`]: {
        post: {
          operationId: 'measureGoals',
          summary:
            'Measure the Goals of the Product now and write draft Insights',
          requestParams: { path: z.object({ product }) },
          responses: {
            200: {
              description: 'The Insights this run wrote',
              ...jsonContent(measureResultSchema),
            },
            ...readErrorResponses,
          },
        },
      },
    },
    ...folderPaths,
  ),
})

export function handleGetOpenApi() {
  return Response.json(openApiDocument)
}
