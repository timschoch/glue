import { beforeEach, describe, expect, it } from 'vitest'

import {
  IntegrationReadError,
  createIntegrationOperations,
} from './integrations.ts'
import type { IntegrationTool } from './integrations.ts'
import { addProject } from './part-records.ts'
import {
  IntegrationNotFoundError,
  InvalidRecordError,
} from './record-errors.ts'
import * as schema from './schema.ts'
import type { SignalSource, SourceSignal } from './signals.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

// No real key: the fake tool takes this one only.
const KEY = 'key-of-the-team-1234'
const SECRET = 'secret-of-the-server'
const REPOSITORY = 'acme/shop'

const shopSignal: SourceSignal = {
  url: 'https://github.com/acme/shop/issues/7',
  title: 'The list is slow',
  text: '',
  date: '2026-10-02',
}

// The reads that the fake tool got, each with its address and its key.
let reads: Array<{ address: string; key: string }>
// The read fails with this error.
let readError: Error | undefined
let clock: Date

// A tool like GitHub: an address is owner/name, and it has one Signal.
const github: IntegrationTool = {
  findAddressProblem: (address) =>
    address.includes('/') ? undefined : 'A repository is owner/name',
  listSignals: async (address, key) => {
    reads.push({ address, key })
    if (readError) throw readError
    return [shopSignal]
  },
}

const createOperations = (secret: string | undefined = SECRET) =>
  createIntegrationOperations({
    db,
    secret,
    tools: { github },
    now: () => clock,
  })

const input = { tool: 'github', address: REPOSITORY, key: KEY }

const active = {
  id: 1,
  tool: 'github',
  address: REPOSITORY,
  keyLastFour: '1234',
  state: 'active',
  lastRead: { at: '2026-10-10T08:00:00.000Z', signalCount: 1, error: null },
}

// The source of the server: the repository of the Project with the token of
// the server.
const serverSource: SignalSource = {
  name: 'github',
  listSignals: async () => [
    { ...shopSignal, url: 'https://github.com/timschoch/glue/issues/1' },
  ],
}

const project = {
  repository: 'timschoch/glue',
  analyticsProject: null,
  supportUrl: null,
  socialHandle: null,
  marketUrl: null,
}

const listRows = () => db.select().from(schema.integrations)

beforeEach(async () => {
  reads = []
  readError = undefined
  clock = new Date('2026-10-10T08:00:00.000Z')
  await addProject(db, 'glue')
  await addProject(db, 'flexibeck')
})

describe('add', () => {
  it('reads from the tool one time, then saves the Integration for the Project', async () => {
    const operations = createOperations()

    const added = await operations.add('glue', input)

    expect(added).toEqual(active)
    expect(reads).toEqual([{ address: REPOSITORY, key: KEY }])
    expect(await operations.list('glue')).toEqual([active])
    expect(await operations.list('flexibeck')).toEqual([])
  })

  it('stores the key encrypted, and each save gives another text', async () => {
    const operations = createOperations()

    await operations.add('glue', input)
    await operations.add('flexibeck', input)

    const [first, second] = await listRows()
    expect(first.encryptedKey).toMatch(/^v1\.[\w-]{16}\.[\w-]{22}\.[\w-]{27}$/)
    expect(first.encryptedKey).not.toBe(second.encryptedKey)
    expect(JSON.stringify([first, second])).not.toContain(KEY)
  })

  it('takes the address and the key without the space around them', async () => {
    const operations = createOperations()

    const added = await operations.add('glue', {
      tool: 'github',
      address: ` ${REPOSITORY} `,
      key: ` ${KEY}\n`,
    })

    expect(added).toEqual(active)
    expect(reads).toEqual([{ address: REPOSITORY, key: KEY }])
  })

  // What a request over HTTP can send: the types do not hold there.
  const sent = (integration: object) => integration as typeof input

  it.each([
    {
      integration: { ...input, tool: 'fax' },
      reason: '"fax" is no tool: github',
      field: 'tool',
    },
    {
      integration: sent({ address: REPOSITORY, key: KEY }),
      reason: 'An Integration needs a tool',
      field: 'tool',
    },
    {
      integration: { ...input, address: ' ' },
      reason: 'An Integration needs an address',
      field: 'address',
    },
    {
      integration: { ...input, address: 'shop' },
      reason: 'A repository is owner/name',
      field: 'address',
    },
    {
      integration: sent({ tool: 'github', address: REPOSITORY }),
      reason: 'An Integration needs a key',
      field: 'key',
    },
    {
      integration: { ...input, key: '1234567' },
      reason: 'A key has at least 8 characters',
      field: 'key',
    },
  ])(
    'refuses an Integration before a read: $reason',
    async ({ integration, reason, field }) => {
      const operations = createOperations()

      const refused = operations.add('glue', integration)

      await expect(refused).rejects.toThrow(InvalidRecordError)
      await expect(refused).rejects.toMatchObject({
        message: reason,
        place: { field },
      })
      expect(reads).toEqual([])
      expect(await listRows()).toEqual([])
    },
  )

  it.each([
    {
      error: new IntegrationReadError('GitHub refused the key', 'key'),
      refusal: { message: 'GitHub refused the key', place: { field: 'key' } },
    },
    {
      error: new IntegrationReadError(
        'GitHub has no repository "acme/shop" that the key can read',
        'address',
      ),
      refusal: {
        message: 'GitHub has no repository "acme/shop" that the key can read',
        place: { field: 'address' },
      },
    },
    {
      error: new Error('fetch failed'),
      refusal: { message: 'fetch failed', place: undefined },
    },
  ])(
    'saves nothing when the test read fails: $refusal.message',
    async ({ error, refusal }) => {
      readError = error
      const operations = createOperations()

      const refused = operations.add('glue', input)

      await expect(refused).rejects.toThrow(InvalidRecordError)
      await expect(refused).rejects.toMatchObject(refusal)
      expect(await listRows()).toEqual([])
    },
  )

  it('refuses a save on a server with no secret, before a read', async () => {
    const operations = createOperations('')

    const refused = operations.add('glue', input)

    await expect(refused).rejects.toThrow(InvalidRecordError)
    await expect(refused).rejects.toMatchObject({
      message:
        'This server cannot store a key. Its setting INTEGRATION_KEY_SECRET is missing.',
    })
    expect(reads).toEqual([])
    expect(await listRows()).toEqual([])
  })

  it('refuses the same tool at the same address a second time', async () => {
    const operations = createOperations()
    await operations.add('glue', input)

    const refused = operations.add('glue', input)

    await expect(refused).rejects.toThrow(InvalidRecordError)
    await expect(refused).rejects.toMatchObject({
      message: '"acme/shop" is an Integration already',
      place: { field: 'address' },
    })
    expect(reads).toHaveLength(1)
  })
})

describe('pause and start', () => {
  it('pauses with no read, then starts again with one read with the stored key', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    reads = []

    const paused = await operations.pause('glue', 1)
    const readsOfPause = [...reads]
    clock = new Date('2026-10-11T09:00:00.000Z')
    const started = await operations.start('glue', 1)

    expect(paused).toEqual({ ...active, state: 'paused' })
    expect(readsOfPause).toEqual([])
    expect(started).toEqual({
      ...active,
      lastRead: { at: '2026-10-11T09:00:00.000Z', signalCount: 1, error: null },
    })
    expect(reads).toEqual([{ address: REPOSITORY, key: KEY }])
  })

  it('stays paused when the read of the start fails, and gives the reason', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    await operations.pause('glue', 1)
    readError = new IntegrationReadError('GitHub refused the key', 'key')

    const refused = operations.start('glue', 1)

    await expect(refused).rejects.toThrow(InvalidRecordError)
    await expect(refused).rejects.toMatchObject({
      message: 'GitHub refused the key',
    })
    expect(await operations.list('glue')).toEqual([
      { ...active, state: 'paused' },
    ])
  })
})

describe('remove', () => {
  it('deletes the Integration with its key', async () => {
    const operations = createOperations()
    await operations.add('glue', input)

    await operations.remove('glue', 1)

    expect(await listRows()).toEqual([])
  })
})

describe('an Integration of another Project', () => {
  it.each(['pause', 'start', 'remove'] as const)(
    'is not found for %s, and stays as it is',
    async (change) => {
      const operations = createOperations()
      await operations.add('glue', input)
      reads = []

      await expect(operations[change]('flexibeck', 1)).rejects.toThrow(
        new IntegrationNotFoundError(1),
      )
      expect(await operations.list('glue')).toEqual([active])
      expect(reads).toEqual([])
    },
  )
})

describe('toSources', () => {
  const listGithub = (operations = createOperations()) =>
    operations.toSources('glue', [serverSource])[0].listSignals(project)

  it('keeps the source of the server for a Project with no Integration', async () => {
    await createOperations().add('flexibeck', input)
    reads = []

    expect(await listGithub()).toEqual([
      { ...shopSignal, url: 'https://github.com/timschoch/glue/issues/1' },
    ])
    expect(reads).toEqual([])
  })

  it('reads with the key of the active Integration, and keeps the time and the count of the read', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    reads = []
    clock = new Date('2026-10-11T09:00:00.000Z')

    const signals = await listGithub(operations)

    expect(signals).toEqual([shopSignal])
    expect(reads).toEqual([{ address: REPOSITORY, key: KEY }])
    expect(await operations.list('glue')).toEqual([
      {
        ...active,
        lastRead: {
          at: '2026-10-11T09:00:00.000Z',
          signalCount: 1,
          error: null,
        },
      },
    ])
  })

  it('brings no Signals from a paused Integration, and asks no tool', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    await operations.pause('glue', 1)
    reads = []

    expect(await listGithub(operations)).toEqual([])
    expect(reads).toEqual([])
  })

  it('marks the Integration as failed when a read fails, and reads it no more', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    reads = []
    clock = new Date('2026-10-11T09:00:00.000Z')
    readError = new IntegrationReadError('GitHub refused the key', 'key')

    await expect(listGithub(operations)).rejects.toThrow(
      'GitHub refused the key',
    )
    const again = await listGithub(operations)

    expect(again).toEqual([])
    expect(reads).toHaveLength(1)
    expect(await operations.list('glue')).toEqual([
      {
        ...active,
        state: 'failed',
        lastRead: {
          at: '2026-10-11T09:00:00.000Z',
          signalCount: null,
          error: 'GitHub refused the key',
        },
      },
    ])
  })

  it('leaves a source alone that is no tool of an Integration', async () => {
    const support: SignalSource = {
      name: 'support',
      listSignals: async () => [],
    }

    const [source] = createOperations().toSources('glue', [support])

    expect(source).toBe(support)
  })

  it('reads nothing on a server with no secret', async () => {
    await createOperations().add('glue', input)
    reads = []

    await expect(listGithub(createOperations(''))).rejects.toThrow(
      'This server cannot store a key. Its setting INTEGRATION_KEY_SECRET is missing.',
    )
    expect(reads).toEqual([])
  })
})
