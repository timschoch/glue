import { beforeEach, describe, expect, it } from 'vitest'

import { fakeWebhookTool } from '../test/integrations.ts'
import { createIntegrationOperations } from './integrations.ts'
import { addProject } from './part-records.ts'
import { InvalidRecordError, WebhookSecretError } from './record-errors.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

// No real secret: the test makes this one in the place of a random one.
const SECRET = 'secret-of-the-webhook-abcd'

let clock: Date

const createOperations = () =>
  createIntegrationOperations({
    db,
    secret: undefined,
    tools: { webhook: fakeWebhookTool },
    now: () => clock,
    createWebhookSecret: () => SECRET,
  })

const input = { tool: 'webhook', address: 'Helpdesk' }

// A post whose body the server has read already.
const send = (
  operations: ReturnType<typeof createOperations>,
  slug: string,
  secret: string,
  body: unknown,
) => operations.addWebhookSignals(slug, secret, () => Promise.resolve(body))

const active = {
  id: 1,
  tool: 'webhook',
  address: 'Helpdesk',
  keyLastFour: 'abcd',
  state: 'active',
  lastRead: null,
}

beforeEach(async () => {
  clock = new Date('2026-10-10T08:00:00.000Z')
  await addProject(db, 'glue')
  await addProject(db, 'flexibeck')
})

describe('add a webhook', () => {
  it('makes the secret, gives it one time and stores only its hash', async () => {
    const operations = createOperations()

    const added = await operations.add('glue', input)

    expect(added).toEqual({ ...active, secret: SECRET })
    expect(await operations.list('glue')).toEqual([active])
    const [row] = await db.select().from(schema.integrations)
    expect(row.encryptedKey).toBe(
      'sha256.3f72968b7004fd024b6b743d04a72e61e913ea575d257b6371274dc797638bf6',
    )
  })

  it('refuses a key of the member, and a name that the Project has', async () => {
    const operations = createOperations()
    await operations.add('glue', input)

    const withKey = operations.add('glue', {
      tool: 'webhook',
      address: 'CRM',
      key: 'key-of-the-team-1234',
    })
    const again = operations.add('glue', input)

    await expect(withKey).rejects.toMatchObject({
      message: 'Glue makes the secret of Webhook',
      place: { field: 'key' },
    })
    await expect(again).rejects.toMatchObject({
      message: '"Helpdesk" is an Integration already',
      place: { field: 'address' },
    })
    expect(await operations.list('glue')).toEqual([active])
  })

  it.each(['github', 'Analytics', 'webhook'])(
    'refuses the name %s: a Signal source or a tool has it',
    async (address) => {
      const operations = createOperations()

      const refused = operations.add('glue', { tool: 'webhook', address })

      await expect(refused).rejects.toMatchObject({
        message: `"${address}" is the name of a Signal source already`,
        place: { field: 'address' },
      })
      expect(await operations.list('glue')).toEqual([])
    },
  )
})

const slowPage = {
  title: 'The list is slow',
  text: 'It takes five seconds to open.',
  link: 'https://helpdesk.example.com/tickets/7',
  time: '2026-10-02T09:30:00Z',
  tool: 'Zendesk',
}

const noExport = {
  title: 'I cannot export',
  link: 'https://helpdesk.example.com/tickets/8',
  tool: 'Zendesk',
}

const project = {
  repository: null,
  analyticsProject: null,
  supportUrl: null,
  socialHandle: null,
  marketUrl: null,
}

// The Signals of each source of the Project, under the name of the source.
async function listBySource(slug = 'glue') {
  const sources = await createOperations().toSources(slug, [])
  return Promise.all(
    sources.map(async ({ name, listSignals }) => ({
      name,
      signals: await listSignals(project),
    })),
  )
}

describe('addWebhookSignals', () => {
  it('stores the Signals of a post under the name of the webhook, and keeps the post as the last read', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    clock = new Date('2026-10-11T09:00:00.000Z')

    const answer = await send(operations, 'glue', SECRET, {
      signals: [slowPage, noExport],
    })

    expect(answer).toEqual({ stored: 2 })
    expect(await listBySource()).toEqual([
      {
        name: 'Helpdesk',
        signals: [
          {
            url: 'https://helpdesk.example.com/tickets/8',
            title: 'I cannot export',
            text: '',
            date: '2026-10-11',
          },
          {
            url: 'https://helpdesk.example.com/tickets/7',
            title: 'The list is slow',
            text: 'It takes five seconds to open.',
            date: '2026-10-02',
          },
        ],
      },
    ])
    expect(await listBySource('flexibeck')).toEqual([])
    expect(await operations.list('glue')).toEqual([
      {
        ...active,
        lastRead: {
          at: '2026-10-11T09:00:00.000Z',
          signalCount: 2,
          error: null,
        },
      },
    ])
    const [row] = await db.select().from(schema.webhookSignals)
    expect(row.tool).toBe('Zendesk')
  })

  it('stores a link one time', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    await send(operations, 'glue', SECRET, { signals: [slowPage] })

    const answer = await send(operations, 'glue', SECRET, {
      signals: [slowPage, noExport],
    })

    expect(answer).toEqual({ stored: 1 })
    expect(await db.select().from(schema.webhookSignals)).toHaveLength(2)
  })

  it.each([
    ['another secret', 'glue', 'secret-of-another-webhook'],
    ['the secret of a webhook of another Project', 'flexibeck', SECRET],
  ])('stores nothing for %s', async (_name, slug, secret) => {
    const operations = createOperations()
    await operations.add('glue', input)

    const refused = send(operations, slug, secret, {
      signals: [slowPage],
    })

    await expect(refused).rejects.toThrow(WebhookSecretError)
    expect(await db.select().from(schema.webhookSignals)).toEqual([])
  })

  it.each([
    ['a wrong secret', 'secret-of-another-webhook', false],
    ['a paused webhook', SECRET, true],
  ])('reads no body for %s', async (_name, secret, isPaused) => {
    const operations = createOperations()
    await operations.add('glue', input)
    if (isPaused) await operations.pause('glue', 1)
    let bodyReads = 0

    const refused = operations.addWebhookSignals('glue', secret, () => {
      bodyReads += 1
      return Promise.resolve({ signals: [slowPage] })
    })

    await expect(refused).rejects.toThrow()
    expect(bodyReads).toBe(0)
  })

  it('stores nothing while the webhook is paused, and stores again after a start', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    await send(operations, 'glue', SECRET, { signals: [slowPage] })
    await operations.pause('glue', 1)

    const refused = send(operations, 'glue', SECRET, {
      signals: [noExport],
    })

    await expect(refused).rejects.toThrow(InvalidRecordError)
    await expect(refused).rejects.toThrow('The webhook is paused')
    expect(await db.select().from(schema.webhookSignals)).toHaveLength(1)
    expect((await listBySource())[0].signals).toHaveLength(1)

    const started = await operations.start('glue', 1)
    const answer = await send(operations, 'glue', SECRET, {
      signals: [noExport],
    })

    expect(started.state).toBe('active')
    expect(answer).toEqual({ stored: 1 })
  })

  it.each([
    ['no Signal', { signals: [] }],
    ['101 Signals', { signals: Array(101).fill(slowPage) }],
    ['a Signal with no title', { signals: [{ ...slowPage, title: ' ' }] }],
    [
      'a link that is no web address',
      { signals: [{ ...slowPage, link: 'javascript:alert(1)' }] },
    ],
    ['a Signal with no tool', { signals: [{ ...noExport, tool: undefined }] }],
    ['a time that is no time', { signals: [{ ...slowPage, time: 'today' }] }],
    ['no list of Signals', [slowPage]],
  ])('refuses a post with %s, and stores nothing', async (_name, post) => {
    const operations = createOperations()
    await operations.add('glue', input)

    const refused = send(operations, 'glue', SECRET, post)

    await expect(refused).rejects.toThrow(InvalidRecordError)
    expect(await db.select().from(schema.webhookSignals)).toEqual([])
  })

  it('takes 100 Signals in one post', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    const signals = Array.from({ length: 100 }, (_, index) => ({
      ...noExport,
      link: `https://helpdesk.example.com/tickets/${index}`,
    }))

    expect(await send(operations, 'glue', SECRET, { signals })).toEqual({
      stored: 100,
    })
  })
})

describe('remove a webhook', () => {
  it('deletes its Signals with it', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    await send(operations, 'glue', SECRET, { signals: [slowPage] })

    await operations.remove('glue', 1)

    expect(await db.select().from(schema.webhookSignals)).toEqual([])
    expect(await listBySource()).toEqual([])
  })
})
