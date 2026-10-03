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
  changedDecisionSchema,
  errorSchema,
  inputSchemas,
  measureResultSchema,
  updateSchemas,
} from './concept-api.ts'
import {
  addedJointSchema,
  changedPartSchema,
  conceptInputSchema,
  jointInputSchema,
  partInputSchema,
  partSchema,
  partSummarySchema,
  partTypesQuerySchema,
  partUpdateSchema,
  projectConceptSchema,
  projectSchema,
} from './part-api.ts'

// `/api/v1/projects/{project}`, and the deprecated `/api/v1/products/{product}`.
type PathParameter = 'project' | 'product'

type FolderSchemas = {
  // One record, as operation ids name it: getGoal, addInsight.
  name: string
  record: z.ZodType
  summary: z.ZodType
  input?: z.ZodType
  update?: z.ZodType
  // The record as an add or an update returns it, when it differs.
  changed?: z.ZodType
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
    changed: changedDecisionSchema,
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
  },
  guardrails: {
    name: 'Guardrail',
    record: guardrailSchema,
    summary: conceptSummarySchemas.guardrails,
  },
}

const slug = z.string().meta({ description: 'The slug of the Project' })
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
    description: 'Not found, or another Project',
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

function listPaths(parameter: PathParameter) {
  const root = `/api/v1/${parameter}s/{${parameter}}`
  // An operation id is unique in the document, so the deprecated twin of an
  // operation gets its own.
  const identify = (operationId: string) =>
    parameter === 'product'
      ? { operationId: `${operationId}Deprecated`, deprecated: true }
      : { operationId }
  const folderPaths = Object.entries(folders).map(
    ([folder, { name, record, summary, input, update, changed = record }]) => ({
      [`${root}/${folder}`]: {
        get: {
          ...identify(`list${name}s`),
          summary: `List the ${folder} of the Project`,
          requestParams: { path: z.object({ [parameter]: slug }) },
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
            ...identify(`add${name}`),
            summary: `Add to the ${folder} of the Project`,
            requestParams: { path: z.object({ [parameter]: slug }) },
            requestBody: jsonContent(input),
            responses: {
              201: { description: 'The new record', ...jsonContent(changed) },
              ...errorResponses,
            },
          },
        }),
      },
      [`${root}/${folder}/{recordId}`]: {
        get: {
          ...identify(`get${name}`),
          summary: `Read one of the ${folder} with its links`,
          requestParams: { path: z.object({ [parameter]: slug, recordId }) },
          responses: {
            200: { description: 'The record', ...jsonContent(record) },
            ...readErrorResponses,
          },
        },
        ...(update && {
          patch: {
            ...identify(`update${name}`),
            summary: `Change one of the ${folder}`,
            requestParams: { path: z.object({ [parameter]: slug, recordId }) },
            requestBody: jsonContent(update),
            responses: {
              200: {
                description: 'The changed record',
                ...jsonContent(changed),
              },
              400: errorResponses[400],
              ...readErrorResponses,
            },
          },
        }),
      },
    }),
  )

  return Object.assign(
    {
      [`${root}/concept`]: {
        get: {
          ...identify('getConcept'),
          summary: 'Read the whole Concept of the Project',
          requestParams: { path: z.object({ [parameter]: slug }) },
          responses: {
            200: { description: 'The Concept', ...jsonContent(conceptSchema) },
            ...readErrorResponses,
          },
        },
      },
      [`${root}/measure`]: {
        post: {
          ...identify('measureGoals'),
          summary:
            'Measure the Goals of the Project now and write draft Insights',
          requestParams: { path: z.object({ [parameter]: slug }) },
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
  )
}

// The Part model has no deprecated twin: it starts under `projects`.
function listPartPaths() {
  const root = '/api/v1/projects/{project}'
  const path = z.object({ project: slug })
  return {
    [root]: {
      get: {
        operationId: 'getProject',
        summary: 'Read the Project with the tree of its Concepts',
        requestParams: { path },
        responses: {
          200: { description: 'The Project', ...jsonContent(projectSchema) },
          ...readErrorResponses,
        },
      },
    },
    [`${root}/concepts`]: {
      post: {
        operationId: 'addConcept',
        summary: 'Nest a Concept in the root Concept or in another one',
        requestParams: { path },
        requestBody: jsonContent(conceptInputSchema),
        responses: {
          201: {
            description: 'The new Concept',
            ...jsonContent(projectConceptSchema),
          },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
    },
    [`${root}/concepts/{concept}`]: {
      get: {
        operationId: 'getProjectConcept',
        summary: 'Read one Concept with its Parts, Joints and slots',
        requestParams: {
          path: path.extend({
            concept: z
              .string()
              .meta({ description: 'The slug of the Concept' }),
          }),
        },
        responses: {
          200: {
            description: 'The Concept',
            ...jsonContent(projectConceptSchema),
          },
          ...readErrorResponses,
        },
      },
    },
    [`${root}/parts`]: {
      get: {
        operationId: 'listParts',
        summary: 'List the Parts of the Project: all, or the ones of the types',
        requestParams: {
          path,
          query: z.object({ type: partTypesQuerySchema.optional() }),
        },
        responses: {
          200: {
            description: 'The Parts, by type, then by number',
            ...jsonContent(z.array(partSummarySchema)),
          },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
      post: {
        operationId: 'addPart',
        summary: 'Add a Part to its home Concept, with the Parts that it needs',
        requestParams: { path },
        requestBody: jsonContent(partInputSchema),
        responses: {
          201: {
            description: 'The new Part',
            ...jsonContent(changedPartSchema),
          },
          ...errorResponses,
        },
      },
    },
    [`${root}/parts/{recordId}`]: {
      get: {
        operationId: 'getPart',
        summary: 'Read one Part with its Joints in both directions',
        requestParams: { path: path.extend({ recordId }) },
        responses: {
          200: { description: 'The Part', ...jsonContent(partSchema) },
          ...readErrorResponses,
        },
      },
      patch: {
        operationId: 'updatePart',
        summary: 'Change the fields of a Part that the request names',
        requestParams: { path: path.extend({ recordId }) },
        requestBody: jsonContent(partUpdateSchema),
        responses: {
          200: {
            description: 'The changed Part',
            ...jsonContent(changedPartSchema),
          },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
    },
    [`${root}/joints`]: {
      post: {
        operationId: 'addJoint',
        summary: 'Glue two Parts: one needs the other, or both need each other',
        requestParams: { path },
        requestBody: jsonContent(jointInputSchema),
        responses: {
          201: {
            description: 'The id of the new Joint',
            ...jsonContent(addedJointSchema),
          },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
    },
    [`${root}/joints/{jointId}`]: {
      delete: {
        operationId: 'removeJoint',
        summary:
          'Remove a Joint, but not the last Goal or evidence of a Decision',
        requestParams: {
          path: path.extend({
            jointId: z.string().meta({ description: 'The id of the Joint' }),
          }),
        },
        responses: {
          204: { description: 'The Joint is gone' },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
    },
  }
}

const openApiDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'Glue Concept API',
    version: '1',
    description:
      'Read and add to the Concept of one Project. A token opens one Project only.',
  },
  // The paths start at the root of the Glue app.
  servers: [{ url: '/' }],
  security: [{ token: [] }],
  components: {
    securitySchemes: { token: { type: 'http', scheme: 'bearer' } },
  },
  paths: {
    ...listPartPaths(),
    ...listPaths('project'),
    ...listPaths('product'),
  },
})

export function handleGetOpenApi() {
  return Response.json(openApiDocument)
}
