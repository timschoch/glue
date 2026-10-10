import { beforeEach, describe, expect, it } from 'vitest'

import { addProject } from '../db/part-records.ts'
import * as schema from '../db/schema.ts'
import { createTestDatabase } from '../db/test-database.ts'
import { WEBHOOK_SECRET, createFakeIntegrations } from '../test/integrations.ts'
import { handlePostWebhook } from './webhook-api.ts'

const { db } = createTestDatabase(schema)

beforeEach(async () => {
  await addProject(db, 'glue')
  await createFakeIntegrations(db).add('glue', {
    tool: 'webhook',
    address: 'Helpdesk',
  })
})

const signal = {
  title: 'The list is slow',
  text: 'It takes five seconds to open.',
  link: 'https://helpdesk.example.com/tickets/7',
  time: '2026-10-02T09:30:00Z',
  tool: 'Zendesk',
}

async function post(
  body: string | ReadableStream<Uint8Array>,
  secret: string | null = WEBHOOK_SECRET,
  headers: Record<string, string> = {},
) {
  const sent = new Headers({ 'content-type': 'application/json', ...headers })
  if (secret) sent.set('authorization', `Bearer ${secret}`)
  const request = new Request('http://localhost/api/v1/projects/glue/webhook', {
    method: 'POST',
    headers: sent,
    body,
    duplex: 'half',
  } as RequestInit)
  const response = await handlePostWebhook({
    db,
    integrations: createFakeIntegrations(db),
    request,
    params: { project: 'glue' },
  })
  return {
    status: response.status,
    body: await response.json(),
    isBodyRead: request.bodyUsed,
  }
}

const listStored = () => db.select().from(schema.webhookSignals)

describe('POST to the webhook of a Project', () => {
  it('stores the Signals of the post, and answers their count', async () => {
    const { status, body } = await post(JSON.stringify({ signals: [signal] }))

    expect({ status, body }).toEqual({ status: 201, body: { stored: 1 } })
    expect(await listStored()).toHaveLength(1)
  })

  it.each([
    ['a wrong secret', 'secret-of-another-webhook'],
    ['no secret', null],
  ])(
    'answers 401 for %s, reads no body and stores nothing',
    async (_name, secret) => {
      const { status, body, isBodyRead } = await post(
        JSON.stringify({ signals: [signal] }),
        secret,
      )

      expect(status).toBe(401)
      expect(body.error.code).toBe('unauthorized')
      expect(isBodyRead).toBe(false)
      expect(await listStored()).toEqual([])
    },
  )

  it('answers 401, not 413, for a big post with a wrong secret', async () => {
    const { status, isBodyRead } = await post(
      'a'.repeat(100_001),
      'secret-of-another-webhook',
      { 'content-length': '100001' },
    )

    expect(status).toBe(401)
    expect(isBodyRead).toBe(false)
  })

  it('stops a body that says no size when it is over 100000 bytes', async () => {
    let sentChunks = 0
    let isStopped = false
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sentChunks += 1
        controller.enqueue(new Uint8Array(30_000).fill(' '.charCodeAt(0)))
      },
      cancel() {
        isStopped = true
      },
    })

    const { status, body } = await post(endless)

    expect(status).toBe(413)
    expect(body.error.code).toBe('too-large')
    expect(isStopped).toBe(true)
    expect(sentChunks).toBeLessThan(10)
    expect(await listStored()).toEqual([])
  })

  it('answers 400 with the reason for a post that breaks a rule', async () => {
    const { status, body } = await post(JSON.stringify({ signals: [] }))

    expect(status).toBe(400)
    expect(body.error.code).toBe('invalid-request')
    expect(await listStored()).toEqual([])
  })

  it('answers 400 for a body that is no JSON', async () => {
    const { status, body } = await post('{')

    expect({ status, body }).toEqual({
      status: 400,
      body: {
        error: { code: 'invalid-request', message: 'the body is not JSON' },
      },
    })
  })

  it('answers 413 for a body of more than 100000 bytes, and stores nothing', async () => {
    const big = JSON.stringify({
      signals: Array(11).fill({ ...signal, text: 'a'.repeat(10_000) }),
    })

    const { status, body } = await post(big)

    expect({ status, body }).toEqual({
      status: 413,
      body: {
        error: {
          code: 'too-large',
          message: 'a post has at most 100000 bytes',
        },
      },
    })
    expect(await listStored()).toEqual([])
  })

  it('answers 413 for a post that says it is too big, before it reads it', async () => {
    const { status, isBodyRead } = await post(
      JSON.stringify({ signals: [signal] }),
      WEBHOOK_SECRET,
      { 'content-length': '100001' },
    )

    expect(status).toBe(413)
    expect(isBodyRead).toBe(false)
  })

  it('answers 400 while the webhook is paused, and stores nothing', async () => {
    await createFakeIntegrations(db).pause('glue', 1)

    const { status, body } = await post(JSON.stringify({ signals: [signal] }))

    expect({ status, body }).toEqual({
      status: 400,
      body: {
        error: { code: 'invalid-request', message: 'The webhook is paused' },
      },
    })
    expect(await listStored()).toEqual([])
  })
})
