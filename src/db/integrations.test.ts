import { beforeEach, describe, expect, it } from 'vitest'

import {
  IntegrationReadError,
  createIntegrationOperations,
} from './integrations.ts'
import type { IntegrationTool } from './integrations.ts'
import { joinProject } from './members.ts'
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
const SECRET = 'secret-of-the-server-0123456789ab'
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

  it('refuses the second of two adds of one address at the same time as a duplicate', async () => {
    const operations = createOperations()

    const [first, second] = await Promise.allSettled([
      operations.add('glue', input),
      operations.add('glue', input),
    ])

    expect(first).toMatchObject({ status: 'fulfilled', value: active })
    expect(second).toEqual({
      status: 'rejected',
      reason: new InvalidRecordError('"acme/shop" is an Integration already', {
        field: 'address',
      }),
    })
    expect(await listRows()).toHaveLength(1)
  })

  it('refuses a save on a server with a secret shorter than 32 characters, before a read', async () => {
    const operations = createOperations('a-secret-of-31-characters-abcde')

    const refused = operations.add('glue', input)

    await expect(refused).rejects.toThrow(InvalidRecordError)
    await expect(refused).rejects.toMatchObject({
      message:
        'This server cannot store a key. Its setting INTEGRATION_KEY_SECRET has fewer than 32 characters.',
    })
    expect(reads).toEqual([])
    expect(await listRows()).toEqual([])
  })
})

describe('setKey', () => {
  const NEW_KEY = 'new-key-of-the-team-9876'

  it('reads one time with the new key, then reads with it from then on', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    reads = []
    clock = new Date('2026-10-11T09:00:00.000Z')

    const changed = await operations.setKey('glue', 1, ` ${NEW_KEY} `)
    await listGithub(operations)

    expect(changed).toEqual({
      ...active,
      keyLastFour: '9876',
      lastRead: { at: '2026-10-11T09:00:00.000Z', signalCount: 1, error: null },
    })
    expect(reads).toEqual([
      { address: REPOSITORY, key: NEW_KEY },
      { address: REPOSITORY, key: NEW_KEY },
    ])
  })

  it('makes a failed Integration active again', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    readError = new IntegrationReadError('GitHub refused the key', 'key')
    for (const _read of [1, 2, 3])
      await listGithub(operations).catch(() => undefined)
    readError = undefined

    const changed = await operations.setKey('glue', 1, NEW_KEY)

    expect(changed).toMatchObject({ state: 'active', keyLastFour: '9876' })
  })

  it('keeps the old key when the read with the new key fails, and gives the reason at the key', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    reads = []
    readError = new IntegrationReadError('GitHub refused the key', 'key')

    const refused = operations.setKey('glue', 1, NEW_KEY)

    await expect(refused).rejects.toThrow(InvalidRecordError)
    await expect(refused).rejects.toMatchObject({
      message: 'GitHub refused the key',
      place: { field: 'key' },
    })
    readError = undefined
    reads = []
    await listGithub(operations)
    expect(reads).toEqual([{ address: REPOSITORY, key: KEY }])
    expect(await operations.list('glue')).toEqual([active])
  })

  it('refuses a key that is too short, before a read', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    reads = []

    const refused = operations.setKey('glue', 1, '1234567')

    await expect(refused).rejects.toThrow(InvalidRecordError)
    await expect(refused).rejects.toMatchObject({
      message: 'A key has at least 8 characters',
      place: { field: 'key' },
    })
    expect(reads).toEqual([])
  })

  it('finds no Integration of another Project', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    reads = []

    await expect(operations.setKey('flexibeck', 1, NEW_KEY)).rejects.toThrow(
      new IntegrationNotFoundError(1),
    )
    expect(reads).toEqual([])
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

const listGithub = (operations = createOperations()) =>
  operations.toSources('glue', [serverSource])[0].listSignals(project)

describe('the Responsible of an Integration', () => {
  const ada = { id: 'user-1', name: 'Ada', email: 'ada@example.com' }
  const ben = { id: 'user-2', name: 'Ben', email: 'ben@example.com' }

  // Three reads in a row fail: the Integration is failed.
  async function failIntegration(
    operations: ReturnType<typeof createOperations>,
  ) {
    readError = new IntegrationReadError('GitHub refused the key', 'key')
    for (const _read of [1, 2, 3])
      await listGithub(operations).catch(() => undefined)
    readError = undefined
  }

  beforeEach(async () => {
    await joinProject(db, 'glue', ada)
    await joinProject(db, 'glue', ben)
  })

  it('is the member who added it: a failed Integration is in the Mine of that member only', async () => {
    const operations = createOperations()
    await operations.add('glue', input, 'Ada@example.com')
    const whileActive = await operations.listMine('glue', ada.email)

    await failIntegration(operations)

    expect(whileActive).toEqual([])
    expect(await operations.listMine('glue', ada.email)).toEqual([
      {
        ...active,
        state: 'failed',
        lastRead: {
          at: '2026-10-10T08:00:00.000Z',
          signalCount: null,
          error: 'GitHub refused the key',
        },
      },
    ])
    expect(await operations.listMine('glue', ben.email)).toEqual([])
  })

  it('leaves Mine when a member starts the Integration again and the read works', async () => {
    const operations = createOperations()
    await operations.add('glue', input, ada.email)
    await failIntegration(operations)

    await operations.start('glue', 1)

    expect(await operations.listMine('glue', ada.email)).toEqual([])
  })

  it('refuses a person who is no member of the Project, before a read', async () => {
    const operations = createOperations()

    const refused = operations.add('glue', input, 'eve@example.com')

    await expect(refused).rejects.toThrow(InvalidRecordError)
    await expect(refused).rejects.toMatchObject({
      message: 'eve@example.com is no member of glue.',
    })
    expect(reads).toEqual([])
    expect(await listRows()).toEqual([])
  })
})

describe('toSources', () => {
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

  const failedRead = {
    at: '2026-10-11T09:00:00.000Z',
    signalCount: null,
    error: 'GitHub refused the key',
  }

  // Reads one time. The read fails.
  const failRead = (operations: ReturnType<typeof createOperations>) =>
    expect(listGithub(operations)).rejects.toThrow('GitHub refused the key')

  it('keeps the Integration active after two failed reads, with the error of the read', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    reads = []
    clock = new Date('2026-10-11T09:00:00.000Z')
    readError = new IntegrationReadError('GitHub refused the key', 'key')

    await failRead(operations)
    await failRead(operations)

    expect(reads).toHaveLength(2)
    expect(await operations.list('glue')).toEqual([
      { ...active, lastRead: failedRead },
    ])
  })

  it('marks the Integration as failed after three failed reads in a row, and reads it no more', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    reads = []
    clock = new Date('2026-10-11T09:00:00.000Z')
    readError = new IntegrationReadError('GitHub refused the key', 'key')

    await failRead(operations)
    await failRead(operations)
    await failRead(operations)
    const again = await listGithub(operations)

    expect(again).toEqual([])
    expect(reads).toHaveLength(3)
    expect(await operations.list('glue')).toEqual([
      { ...active, state: 'failed', lastRead: failedRead },
    ])
  })

  it('counts the failed reads from zero again after one good read', async () => {
    const operations = createOperations()
    await operations.add('glue', input)
    clock = new Date('2026-10-11T09:00:00.000Z')
    readError = new IntegrationReadError('GitHub refused the key', 'key')
    await failRead(operations)
    await failRead(operations)
    readError = undefined
    await listGithub(operations)
    readError = new IntegrationReadError('GitHub refused the key', 'key')

    await failRead(operations)
    await failRead(operations)

    expect(await operations.list('glue')).toEqual([
      { ...active, lastRead: failedRead },
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

// A new tool is one adapter and one entry in the list of the tools. The
// module names no tool: this one is known to this test only.
describe('a tool that only the list of the tools names', () => {
  const ada = { id: 'user-1', name: 'Ada', email: 'ada@example.com' }
  const alert: SourceSignal = {
    url: 'https://pager.example/alerts/1',
    title: 'The shop is down',
    text: '',
    date: '2026-10-09',
  }
  let pagerError: Error | undefined

  const pager: IntegrationTool = {
    findAddressProblem: (address) =>
      address.startsWith('team-') ? undefined : 'A pager address is team-name',
    listSignals: async () => {
      if (pagerError) throw pagerError
      return [alert]
    },
  }
  const createPagerOperations = () =>
    createIntegrationOperations({
      db,
      secret: SECRET,
      tools: { github, pager },
      now: () => clock,
    })
  const pagerInput = { tool: 'pager', address: 'team-shop', key: KEY }
  const added = {
    id: 1,
    tool: 'pager',
    address: 'team-shop',
    keyLastFour: '1234',
    state: 'active',
    lastRead: { at: '2026-10-10T08:00:00.000Z', signalCount: 1, error: null },
  }
  const refusedRead = {
    at: '2026-10-10T08:00:00.000Z',
    signalCount: null,
    error: 'The pager refused the key',
  }
  // The Signals of the tool, as the Project reads them. The server has no
  // source with the name of the tool.
  const listAlerts = (operations: ReturnType<typeof createPagerOperations>) =>
    operations
      .toSources('glue', [serverSource])
      .find(({ name }) => name === 'pager')
      ?.listSignals(project)

  beforeEach(async () => {
    pagerError = undefined
    await joinProject(db, 'glue', ada)
  })

  it('adds with a test read and its own address check, lists, and reads its Signals', async () => {
    const operations = createPagerOperations()

    const refused = operations.add('glue', { ...pagerInput, address: 'shop' })
    await expect(refused).rejects.toEqual(
      new InvalidRecordError('A pager address is team-name', {
        field: 'address',
      }),
    )
    expect(await operations.add('glue', pagerInput, ada.email)).toEqual(added)

    expect(await operations.list('glue')).toEqual([added])
    expect(await listAlerts(operations)).toEqual([alert])
  })

  it('fails after three reads, is in Mine, takes a new key, pauses, starts and is removed', async () => {
    const operations = createPagerOperations()
    await operations.add('glue', pagerInput, ada.email)
    pagerError = new IntegrationReadError('The pager refused the key', 'key')
    for (const _read of [1, 2, 3])
      await listAlerts(operations)?.catch(() => undefined)
    const failed = { ...added, state: 'failed', lastRead: refusedRead }

    expect(await operations.listMine('glue', ada.email)).toEqual([failed])
    await expect(
      operations.setKey('glue', 1, 'new-key-of-the-team-5678'),
    ).rejects.toEqual(
      new InvalidRecordError('The pager refused the key', { field: 'key' }),
    )

    pagerError = undefined
    await operations.setKey('glue', 1, 'new-key-of-the-team-5678')
    const withNewKey = { ...added, keyLastFour: '5678' }

    expect(await operations.list('glue')).toEqual([withNewKey])
    expect(await operations.listMine('glue', ada.email)).toEqual([])

    await operations.pause('glue', 1)
    expect(await listAlerts(operations)).toEqual([])
    await operations.start('glue', 1)
    expect(await operations.list('glue')).toEqual([withNewKey])

    await operations.remove('glue', 1)
    expect(await operations.list('glue')).toEqual([])
  })
})
