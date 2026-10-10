// The Integration tool for PostHog (glue/D72): the address is the region and
// the id of the PostHog project, and the key is a personal API key of the
// team that can read. Its Signals are the Signals of the analytics source:
// the survey answers with a low score.
import { z } from 'zod'

import { IntegrationReadError } from '../db/integrations.ts'
import type { ReadTool } from '../db/integrations.ts'
import { createResponseError } from '../measure/response-error.ts'
import {
  HIGHEST_SCORE,
  LOW_SCORE,
  REMARK_PROPERTY,
  SCORE_PROPERTY,
  SURVEY_EVENT,
  WINDOW_DAYS,
} from './analytics-source.ts'

// The servers of PostHog, by region. Glue asks no other server: the address
// of a member picks one of these and never names a host.
const HOSTS: Readonly<Record<string, string>> = {
  us: 'https://us.posthog.com',
  eu: 'https://eu.posthog.com',
}

const ADDRESS = /^(us|eu)\/(\d+)$/
const ADDRESS_PROBLEM =
  'A PostHog project is the region and the id, for example eu/12345'

const TIMEOUT_MS = 10_000
// The most answers of one read.
const MAX_ANSWERS = 100

const UNAUTHORIZED = 401
const FORBIDDEN = 403
const NOT_FOUND = 404

const QUERY = `select uuid, timestamp, properties.${SCORE_PROPERTY}, properties.${REMARK_PROPERTY} from events where event = '${SURVEY_EVENT}' and toFloat(properties.${SCORE_PROPERTY}) <= ${LOW_SCORE} and timestamp >= now() - interval ${WINDOW_DAYS} day order by timestamp desc limit ${MAX_ANSWERS}`

// One row for each answer: the id of the event, its time, the score and the
// words of the answer. PostHog gives the score as it was sent: a number or
// its text.
const answersSchema = z.object({
  results: z.array(
    z.tuple([z.string(), z.string(), z.coerce.number(), z.string().nullable()]),
  ),
})

// What the member changes after PostHog refused the read.
function toReadError(status: number, region: string, projectId: string) {
  if (status === UNAUTHORIZED)
    return new IntegrationReadError('PostHog refused the key', 'key')
  if (status === FORBIDDEN)
    return new IntegrationReadError(
      `The key cannot read the events of the project ${projectId}`,
      'key',
    )
  if (status === NOT_FOUND)
    return new IntegrationReadError(
      `PostHog has no project ${projectId} in the region ${region} that the key can read`,
      'address',
    )
  return undefined
}

// A test gives a fake `send`.
export function createPosthogTool(send: typeof fetch = fetch): ReadTool {
  return {
    label: 'PostHog',
    addressFields: [
      {
        label: 'Region',
        options: [
          { value: 'us', label: 'US' },
          { value: 'eu', label: 'EU' },
        ],
      },
      { label: 'Project ID' },
    ],
    source: 'analytics',
    findAddressProblem: (address) =>
      ADDRESS.test(address) ? undefined : ADDRESS_PROBLEM,
    listSignals: async (address, key) => {
      const [, region, projectId] = ADDRESS.exec(address) ?? []
      if (!region) throw new IntegrationReadError(ADDRESS_PROBLEM, 'address')
      const host = HOSTS[region]
      const response = await send(`${host}/api/projects/${projectId}/query/`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query: QUERY } }),
        // No redirect takes the key of the team to another server.
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) {
        throw (
          toReadError(response.status, region, projectId) ??
          (await createResponseError('PostHog', response))
        )
      }
      const { results } = answersSchema.parse(await response.json())
      return results.map(([id, timestamp, score, remark]) => ({
        url: `${host}/project/${projectId}/events/${id}/${encodeURIComponent(timestamp)}`,
        title: `Survey answer ${score} of ${HIGHEST_SCORE}`,
        titleBy: 'glue' as const,
        text: remark ?? '',
        date: timestamp.slice(0, 'yyyy-mm-dd'.length),
      }))
    },
  }
}
