// The OpenAPI document of the HTTP API, built from the same schemas
// that validate the requests. No hand-written copy.
import { z } from 'zod'
import { createDocument } from 'zod-openapi'

import { toToolForms } from '../db/integrations.ts'
import { integrationTools } from '../signals/integration-tools.ts'
import { errorSchema } from './api-request.ts'
import {
  addedAskSchema,
  askInputSchema,
  askSchema,
  askStepInputSchema,
  askTakeBackQuerySchema,
} from './ask-api.ts'
import {
  validatedBuildSchema,
  gateSchema,
  projectBuildsSchema,
} from './build-api.ts'
import {
  contractSchema,
  contractSignInputSchema,
  contractVersionQuerySchema,
} from './contract-api.ts'
import {
  contractQuestionAnswerInputSchema,
  contractQuestionInputSchema,
  contractQuestionSchema,
} from './contract-question-api.ts'
import { measureResultSchema } from './measure-api.ts'
import {
  addedJointSchema,
  answerInputSchema,
  changedPartSchema,
  conceptInputSchema,
  conceptUpdateSchema,
  jointInputSchema,
  kindInputSchema,
  kindSchema,
  kindUpdateSchema,
  leveledPartSchema,
  partInputSchema,
  partSchema,
  partSummarySchema,
  partTypesQuerySchema,
  partUpdateSchema,
  projectConceptSchema,
  projectSchema,
  questionAnswerInputSchema,
} from './part-api.ts'
import {
  assignmentInputSchema,
  assignmentSchema,
  memberInputSchema,
  memberSchema,
  watcherInputSchema,
  watcherOutputSchema,
  watchersQuerySchema,
} from './people-api.ts'
import {
  integrationChangeSchema,
  integrationInputSchema,
  savedIntegrationSchema,
} from './integration-api.ts'
import { projectSignalsSchema, signalInsightInputSchema } from './signal-api.ts'
import { webhookAnswerSchema, webhookPostInputSchema } from './webhook-api.ts'
import {
  savedSignalFilterSchema,
  signalFilterInputSchema,
} from './signal-filter-api.ts'

// The measure run: `/api/v1/projects/{project}`, and the deprecated
// `/api/v1/products/{product}`.
type PathParameter = 'project' | 'product'

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

// What each tool asks for, from the list of the tools.
const toolTexts = toToolForms(integrationTools)
  .map(({ name, addressFields, needsKey }) => {
    const address = addressFields
      .map(({ label, options }) =>
        options
          ? `${label} ${options.map(({ value }) => value).join(' or ')}`
          : label,
      )
      .join(' / ')
    const key = needsKey ? 'with a key' : 'no key, Glue makes the secret'
    return `${name} (address: ${address}; ${key})`
  })
  .join(', ')

const readErrorResponses = {
  401: errorResponses[401],
  404: errorResponses[404],
}

function listMeasurePaths(parameter: PathParameter) {
  const root = `/api/v1/${parameter}s/{${parameter}}`
  // An operation id is unique in the document, so the deprecated twin of an
  // operation gets its own.
  const identify = (operationId: string) =>
    parameter === 'product'
      ? { operationId: `${operationId}Deprecated`, deprecated: true }
      : { operationId }
  return {
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
  }
}

// The Part model has no deprecated twin: it starts under `projects`.
function listPartPaths() {
  const root = '/api/v1/projects/{project}'
  const path = z.object({ project: slug })
  const filterPath = path.extend({
    filterId: z.string().meta({ description: 'The id of the saved filter' }),
  })
  const integrationPath = path.extend({
    integrationId: z
      .string()
      .meta({ description: 'The id of the Integration' }),
  })
  const conceptSlug = z
    .string()
    .meta({ description: 'The slug of the Concept' })
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
        requestParams: { path: path.extend({ concept: conceptSlug }) },
        responses: {
          200: {
            description: 'The Concept',
            ...jsonContent(projectConceptSchema),
          },
          ...readErrorResponses,
        },
      },
      patch: {
        operationId: 'updateConcept',
        summary: 'Give a Concept a new title, a new parent or another Kind',
        requestParams: { path: path.extend({ concept: conceptSlug }) },
        requestBody: jsonContent(conceptUpdateSchema),
        responses: {
          200: {
            description: 'The Concept after the change',
            ...jsonContent(projectConceptSchema),
          },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
      delete: {
        operationId: 'removeConcept',
        summary:
          'Remove a Concept that holds no Part, no Concept and no Contract Version. The root Concept stays',
        requestParams: { path: path.extend({ concept: conceptSlug }) },
        responses: {
          204: { description: 'The Concept is gone' },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
    },
    [`${root}/kinds`]: {
      get: {
        operationId: 'listKinds',
        summary: 'List the Kinds of the Project with their slots',
        requestParams: { path },
        responses: {
          200: {
            description: 'The Kinds, in the order they were added',
            ...jsonContent(z.array(kindSchema)),
          },
          ...readErrorResponses,
        },
      },
      post: {
        operationId: 'addKind',
        summary: 'Add a Kind with its slots',
        requestParams: { path },
        requestBody: jsonContent(kindInputSchema),
        responses: {
          201: { description: 'The new Kind', ...jsonContent(kindSchema) },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
    },
    [`${root}/kinds/{kind}`]: {
      patch: {
        operationId: 'updateKind',
        summary:
          'Give a Kind a new name or new slots. Each Concept of the Kind has the new slots from then on',
        requestParams: {
          path: path.extend({
            kind: z.string().meta({ description: 'The slug of the Kind' }),
          }),
        },
        requestBody: jsonContent(kindUpdateSchema),
        responses: {
          200: {
            description: 'The Kind after the change',
            ...jsonContent(kindSchema),
          },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
    },
    [`${root}/concepts/{concept}/contract`]: {
      get: {
        operationId: 'getContract',
        summary:
          'Read the newest Contract Version of a Concept, or the one of the number',
        requestParams: {
          path: path.extend({ concept: conceptSlug }),
          query: z.object({ version: contractVersionQuerySchema.optional() }),
        },
        responses: {
          200: {
            description: 'The Contract Version, tier 1 before tier 2',
            ...jsonContent(contractSchema),
          },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
      post: {
        operationId: 'signContract',
        summary:
          'Sign off a Concept: freeze its Parts as the next Contract Version. Each Part needs Trust solid, and each required slot of the Kind needs its Parts',
        requestParams: { path: path.extend({ concept: conceptSlug }) },
        requestBody: jsonContent(contractSignInputSchema),
        responses: {
          201: {
            description: 'The new Contract Version',
            ...jsonContent(contractSchema),
          },
          ...errorResponses,
        },
      },
    },
    [`${root}/concepts/{concept}/questions`]: {
      get: {
        operationId: 'listContractQuestions',
        summary:
          'List the questions of builders about the Contract of a Concept, with their answers',
        requestParams: { path: path.extend({ concept: conceptSlug }) },
        responses: {
          200: {
            description: 'The questions, the newest first',
            ...jsonContent(z.array(contractQuestionSchema)),
          },
          ...readErrorResponses,
        },
      },
      post: {
        operationId: 'askContractQuestion',
        summary:
          'Ask a question about a Contract Version of a Concept as a builder. The member who is Responsible for the Concept answers',
        requestParams: { path: path.extend({ concept: conceptSlug }) },
        requestBody: jsonContent(contractQuestionInputSchema),
        responses: {
          201: {
            description: 'The question',
            ...jsonContent(contractQuestionSchema),
          },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
    },
    [`${root}/questions`]: {
      get: {
        operationId: 'listMineContractQuestions',
        summary:
          'List the questions about a Contract Version in Mine of the Project: the ones with no answer',
        requestParams: {
          path,
          query: z.object({
            member: z.string().optional().meta({
              description:
                'The e-mail address of a member: only the questions of the Concepts that the member is Responsible for. A Concept with no Responsible: each Co-Author',
            }),
          }),
        },
        responses: {
          200: {
            description: 'The open questions, the newest first',
            ...jsonContent(z.array(contractQuestionSchema)),
          },
          ...readErrorResponses,
        },
      },
    },
    [`${root}/questions/{questionId}`]: {
      patch: {
        operationId: 'answerContractQuestion',
        summary:
          'Answer a question about a Contract Version. A question has one answer',
        requestParams: {
          path: path.extend({
            questionId: z
              .string()
              .meta({ description: 'The id of the question' }),
          }),
        },
        requestBody: jsonContent(contractQuestionAnswerInputSchema),
        responses: {
          200: {
            description: 'The question with its answer',
            ...jsonContent(contractQuestionSchema),
          },
          400: errorResponses[400],
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
          query: z.object({
            type: partTypesQuerySchema.optional(),
            member: z.string().optional().meta({
              description:
                'The e-mail address of a member: each Part gets its flight level for the member',
            }),
          }),
        },
        responses: {
          200: {
            description: 'The Parts, by type, then by number',
            ...jsonContent(z.array(leveledPartSchema)),
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
    [`${root}/parts/{recordId}/answers`]: {
      post: {
        operationId: 'answerPart',
        summary:
          'Answer a Part as its owner: fine, wait, need time, not ready, supersede or sink. Or answer its flag of a new Contract Version: move to version',
        requestParams: { path: path.extend({ recordId }) },
        requestBody: jsonContent(answerInputSchema),
        responses: {
          200: {
            description: 'The Part after the answer',
            ...jsonContent(changedPartSchema),
          },
          400: {
            ...errorResponses[400],
            description:
              'The request breaks a rule, or the Part has a flag and the member of the token is not its owner',
          },
          ...readErrorResponses,
        },
      },
    },
    [`${root}/parts/{recordId}/question-answers`]: {
      post: {
        operationId: 'answerQuestion',
        summary:
          'Answer the question of a proposed Decision: pick an option or write an answer. The Decision becomes accepted',
        requestParams: { path: path.extend({ recordId }) },
        requestBody: jsonContent(questionAnswerInputSchema),
        responses: {
          200: {
            description: 'The Decision after the answer',
            ...jsonContent(changedPartSchema),
          },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
    },
    [`${root}/mine`]: {
      get: {
        operationId: 'listMine',
        summary:
          'List what needs the owner: the Parts in to-check, draft or review',
        requestParams: {
          path,
          query: z.object({
            member: z.string().optional().meta({
              description:
                'The e-mail address of a member: only the Parts where the member is Responsible or Co-Author, and the Parts that nobody has',
            }),
          }),
        },
        responses: {
          200: {
            description: 'The Parts, the newest change first',
            ...jsonContent(z.array(partSummarySchema)),
          },
          ...readErrorResponses,
        },
      },
    },
    [`${root}/signals`]: {
      get: {
        operationId: 'listSignals',
        summary:
          'List the Signals of the Project: the issues with the label user-feedback, the support tickets, the survey answers with a low score, the comments in the social channel and the findings of the market analysis',
        requestParams: {
          path,
          query: z.object({
            source: z.string().optional().meta({
              description:
                'Only the Signals of this source: github, support, analytics, social or market',
            }),
            filter: z.string().optional().meta({
              description:
                'The id of a saved filter of the Project: only the Signals that pass it, and their groups',
            }),
          }),
        },
        responses: {
          200: {
            description:
              'The Signals, the newest first, each with the Insight that grew from it',
            ...jsonContent(projectSignalsSchema),
          },
          ...readErrorResponses,
        },
      },
    },
    [`${root}/signal-filters`]: {
      get: {
        operationId: 'listSignalFilters',
        summary: 'List the saved filters of the Signals of the Project',
        requestParams: { path },
        responses: {
          200: {
            description: 'The saved filters, by name',
            ...jsonContent(z.array(savedSignalFilterSchema)),
          },
          ...readErrorResponses,
        },
      },
      post: {
        operationId: 'addSignalFilter',
        summary:
          'Save a filter of the Signals of the Project. Each member sees it beside the source filters',
        requestParams: { path },
        requestBody: jsonContent(signalFilterInputSchema),
        responses: {
          201: {
            description: 'The saved filter',
            ...jsonContent(savedSignalFilterSchema),
          },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
    },
    [`${root}/signal-filters/{filterId}`]: {
      patch: {
        operationId: 'updateSignalFilter',
        summary:
          'Change a saved filter. The body takes the place of all its values',
        requestParams: { path: filterPath },
        requestBody: jsonContent(signalFilterInputSchema),
        responses: {
          200: {
            description: 'The changed filter',
            ...jsonContent(savedSignalFilterSchema),
          },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
      delete: {
        operationId: 'removeSignalFilter',
        summary: 'Delete a saved filter',
        requestParams: { path: filterPath },
        responses: {
          204: { description: 'The filter is gone' },
          ...readErrorResponses,
        },
      },
    },
    [`${root}/integrations`]: {
      get: {
        operationId: 'listIntegrations',
        summary:
          'List the Integrations of the Project: the tools of the team that Glue reads Signals from. Needs a token of this Project',
        requestParams: { path },
        responses: {
          200: {
            description:
              'The Integrations, by tool and address. No answer holds a key',
            ...jsonContent(z.array(savedIntegrationSchema)),
          },
          ...readErrorResponses,
        },
      },
      post: {
        operationId: 'addIntegration',
        summary:
          'Add an Integration. Glue reads from the tool one time, and saves only when the read works. Needs the token of a member',
        description: `The tools: ${toolTexts}`,
        requestParams: { path },
        requestBody: jsonContent(integrationInputSchema),
        responses: {
          201: {
            description:
              'The saved Integration. For a tool that posts to Glue, with its secret',
            ...jsonContent(savedIntegrationSchema),
          },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
    },
    [`${root}/integrations/{integrationId}`]: {
      patch: {
        operationId: 'changeIntegration',
        summary:
          'Pause an Integration, or start it again. Needs the token of a member',
        requestParams: { path: integrationPath },
        requestBody: jsonContent(integrationChangeSchema),
        responses: {
          200: {
            description: 'The changed Integration',
            ...jsonContent(savedIntegrationSchema),
          },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
      delete: {
        operationId: 'removeIntegration',
        summary:
          'Delete an Integration with its key. Needs the token of a member',
        requestParams: { path: integrationPath },
        responses: {
          204: { description: 'The Integration and its key are gone' },
          ...readErrorResponses,
        },
      },
    },
    [`${root}/webhook`]: {
      post: {
        operationId: 'postWebhookSignals',
        summary:
          'Post Signals from a tool of the team. Needs the secret of a webhook of the Project, not a token. A paused webhook stores nothing',
        security: [{ webhookSecret: [] }],
        requestParams: { path },
        requestBody: jsonContent(webhookPostInputSchema),
        responses: {
          201: {
            description: 'The count of the stored Signals',
            ...jsonContent(webhookAnswerSchema),
          },
          400: errorResponses[400],
          401: {
            description: 'No secret of a webhook of the Project',
            ...jsonContent(errorSchema),
          },
          413: {
            description: 'The post is too big',
            ...jsonContent(errorSchema),
          },
        },
      },
    },
    [`${root}/signals/insights`]: {
      post: {
        operationId: 'addSignalInsight',
        summary:
          'Add a draft Insight at the level hunch that grows from the Signals',
        requestParams: { path },
        requestBody: jsonContent(signalInsightInputSchema),
        responses: {
          201: { description: 'The new Insight', ...jsonContent(partSchema) },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
    },
    [`${root}/builds`]: {
      get: {
        operationId: 'listBuilds',
        summary:
          'List the builds of the Project: the pull requests of its repository',
        requestParams: { path },
        responses: {
          200: {
            description:
              'The open builds and the newest merged ones, each with the Decisions and the Contract Version that it names',
            ...jsonContent(projectBuildsSchema),
          },
          ...readErrorResponses,
        },
      },
    },
    [`${root}/gate`]: {
      post: {
        operationId: 'validateBuild',
        summary:
          'Check a build against the Contract of its Concept, and keep the result with the build',
        requestParams: { path },
        requestBody: jsonContent(validatedBuildSchema),
        responses: {
          200: {
            description:
              'The build holds, or it breaks with the reasons. A check in CI fails on `breaks`. `guardrails` lists each Guardrail of the Contract Version with its state',
            ...jsonContent(gateSchema),
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
    [`${root}/asks`]: {
      get: {
        operationId: 'listAsks',
        summary:
          'List the Asks in Mine of the Project: the ones to pick or to hand back, and the ones with a Part to check',
        requestParams: {
          path,
          query: z.object({
            member: z.string().optional().meta({
              description:
                'The e-mail address of a member: only the Asks that nobody picked, the ones that the member picked, and the ones of the Parts that the member has',
            }),
          }),
        },
        responses: {
          200: {
            description: 'The open Asks, the oldest first',
            ...jsonContent(z.array(askSchema)),
          },
          ...readErrorResponses,
        },
      },
      post: {
        operationId: 'addAsk',
        summary:
          'Ask another Project to check a Hunch, or for a Decision. The Project must be one that this Project may reference',
        requestParams: { path },
        requestBody: jsonContent(askInputSchema),
        responses: {
          201: {
            description: 'The id of the new Ask',
            ...jsonContent(addedAskSchema),
          },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
    },
    [`${root}/asks/{askId}`]: {
      patch: {
        operationId: 'updateAsk',
        summary:
          'Take the next step of an Ask as the asked Project: pick it, start its study, or hand back a published Insight or Decision. A Decision that is handed back ends the Ask: the Part that waits needs it. So does an Insight of the study',
        requestParams: {
          path: path.extend({
            askId: z.string().meta({ description: 'The id of the Ask' }),
          }),
        },
        requestBody: jsonContent(askStepInputSchema),
        responses: {
          204: { description: 'The Ask is at its next step' },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
      delete: {
        operationId: 'removeAsk',
        summary:
          'Take an Ask back as the member who asked, while no member picked it',
        requestParams: {
          path: path.extend({
            askId: z.string().meta({ description: 'The id of the Ask' }),
          }),
          query: askTakeBackQuerySchema,
        },
        responses: {
          204: { description: 'The Ask is gone' },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
    },
    [`${root}/members`]: {
      get: {
        operationId: 'listMembers',
        summary: 'List the members of the Project with their loop steps',
        requestParams: { path },
        responses: {
          200: {
            description: 'The members, by name',
            ...jsonContent(z.array(memberSchema)),
          },
          ...readErrorResponses,
        },
      },
      post: {
        operationId: 'addMember',
        summary: 'Make the account of an e-mail address a member',
        requestParams: { path },
        requestBody: jsonContent(memberInputSchema),
        responses: {
          201: { description: 'The member', ...jsonContent(memberSchema) },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
    },
    [`${root}/assignments`]: {
      get: {
        operationId: 'listAssignments',
        summary: 'List who is Responsible or Co-Author of a Concept or a Part',
        requestParams: { path },
        responses: {
          200: {
            description: 'The assignments of the Project',
            ...jsonContent(z.array(assignmentSchema)),
          },
          ...readErrorResponses,
        },
      },
      post: {
        operationId: 'assign',
        summary:
          'Make a member Responsible or Co-Author. A new Responsible takes the place of the old one',
        requestParams: { path },
        requestBody: jsonContent(assignmentInputSchema),
        responses: {
          201: {
            description: 'The assignments of the Project',
            ...jsonContent(z.array(assignmentSchema)),
          },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
      delete: {
        operationId: 'unassign',
        summary: 'Take a Concept or a Part from a member',
        requestParams: {
          path,
          query: z.object({
            member: z
              .string()
              .meta({ description: 'The e-mail address of the member' }),
            concept: z.string().optional(),
            part: z.string().optional(),
          }),
        },
        responses: {
          204: { description: 'The assignment is gone' },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
    },
    [`${root}/watchers`]: {
      get: {
        operationId: 'listWatchers',
        summary: 'List who watches a Part. A watcher is not the owner',
        requestParams: { path, query: watchersQuerySchema },
        responses: {
          200: {
            description: 'The watchers of the Project, or of the one Part',
            ...jsonContent(z.array(watcherOutputSchema)),
          },
          ...readErrorResponses,
        },
      },
      post: {
        operationId: 'watch',
        summary:
          'Make a member a watcher of a Part. A second time changes nothing',
        requestParams: { path },
        requestBody: jsonContent(watcherInputSchema),
        responses: {
          201: {
            description: 'The watchers of the Part',
            ...jsonContent(z.array(watcherOutputSchema)),
          },
          400: errorResponses[400],
          ...readErrorResponses,
        },
      },
      delete: {
        operationId: 'unwatch',
        summary: 'Stop the watch of a member on a Part',
        requestParams: {
          path,
          query: z.object({
            member: z
              .string()
              .meta({ description: 'The e-mail address of the member' }),
            part: z.string().meta({ description: 'The record id of the Part' }),
          }),
        },
        responses: {
          204: { description: 'The member does not watch the Part' },
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
    securitySchemes: {
      token: {
        type: 'http',
        scheme: 'bearer',
        description:
          'A token belongs to one member of its Project: a person or an agent. Each write of a Part with the token is a write of that member. The member owns the Parts that it adds, the activity names the member, and only the owner of a Part answers its flag. A token with no member writes as nobody',
      },
      webhookSecret: {
        type: 'http',
        scheme: 'bearer',
        description:
          'The secret of a webhook of the Project. Glue gives it one time, in the answer to the add of the webhook',
      },
    },
  },
  paths: {
    ...listPartPaths(),
    ...listMeasurePaths('project'),
    ...listMeasurePaths('product'),
  },
})

export function handleGetOpenApi() {
  return Response.json(openApiDocument)
}
