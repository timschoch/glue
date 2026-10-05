import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The tests read mock support itself. The CLI never imports the Mock.
import { createApp as createSupportApp } from '../mocks/support/src/create-app.ts'
import { setProductRepository } from '../src/db/projects.ts'
import { addProject } from '../src/db/part-records.ts'
import { findPart } from '../src/db/parts.ts'
import * as schema from '../src/db/schema.ts'
import { createTestDatabase } from '../src/db/test-database.ts'
import { createFakeGithub, failingGithub } from '../src/test/github.ts'
import { runConcept } from './concept.ts'

describe('pnpm concept signals', () => {
  const { db } = createTestDatabase(schema)
  let github = createFakeGithub().github
  let log: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  const signal = {
    url: 'https://github.com/timschoch/glue/issues/7',
    title: 'The list is slow',
    body: 'It takes five seconds to open.',
    createdAt: '2026-10-02T08:00:00Z',
  }

  function run(...args: string[]) {
    return runConcept(db, () => github, args)
  }

  beforeEach(async () => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
    github = createFakeGithub([signal]).github
    await addProject(db, 'glue')
    await setProductRepository(db, 'glue', 'timschoch/glue')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('lists the Signals of the Project glue', async () => {
    await run('signals')

    expect(log.mock.calls).toEqual([
      [`2026-10-02  github  ${signal.url}  The list is slow`],
    ])
  })

  // The help desk of glue is mock support with two tickets.
  async function setSupport() {
    const support = createSupportApp({
      tickets: [
        {
          id: 4,
          subject: 'I cannot find the export',
          description: 'Where is the button?',
          status: 'open',
          created_at: '2026-10-03T09:00:00Z',
        },
        {
          id: 3,
          subject: 'The invite mail did not come',
          description: 'I asked two times.',
          status: 'open',
          created_at: '2026-10-01T09:00:00Z',
        },
      ],
    })
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      support.request(new Request(input, init)),
    )
    await run('project', 'set', 'glue', '--support', 'https://support.test')
  }

  it('lists the Signals of all sources, the newest first', async () => {
    await setSupport()

    await run('signals')

    expect(log.mock.calls).toEqual([
      [
        '2026-10-03  support  https://support.test/agent/tickets/4  I cannot find the export',
      ],
      [`2026-10-02  github  ${signal.url}  The list is slow`],
      [
        '2026-10-01  support  https://support.test/agent/tickets/3  The invite mail did not come',
      ],
    ])
  })

  it('lists the Signals of the source of --source only', async () => {
    await setSupport()

    await run('signals', '--source', 'github')

    expect(log.mock.calls).toEqual([
      [`2026-10-02  github  ${signal.url}  The list is slow`],
    ])
  })

  it('adds the Insight that grows from a ticket and an issue', async () => {
    await setSupport()
    const ticket = 'https://support.test/agent/tickets/4'

    await run('signals', 'insight', ticket, signal.url, '--title', 'Lost')

    expect(await findPart(db, 'glue', 'I1')).toMatchObject({
      title: 'Lost',
      signals: [
        { url: ticket, title: 'I cannot find the export' },
        { url: signal.url, title: signal.title },
      ],
    })
  })

  it('removes the help desk of the Project with an empty --support', async () => {
    await setSupport()

    await run('project', 'set', 'glue', '--support', '')
    await run('signals', '--source', 'support')

    expect(log).not.toHaveBeenCalled()
  })

  it('adds the Insight that grows from the Signals, and lists it on them', async () => {
    await run('signals', 'insight', signal.url, '--title', 'Lists are slow')
    await run('signals', '--project', 'glue')

    expect(log.mock.calls).toEqual([
      ['I1'],
      [`2026-10-02  github  ${signal.url}  I1  The list is slow`],
    ])
    expect(await findPart(db, 'glue', 'I1')).toMatchObject({
      title: 'Lists are slow',
      evidenceLevel: 'hunch',
      signals: [{ url: signal.url, title: signal.title }],
    })
  })

  it('names the source that failed, and lists the Signals of the others', async () => {
    await setSupport()
    github = failingGithub

    await run('signals')

    expect(log.mock.calls.length).toBe(2)
    expect(error.mock.calls).toEqual([['github: GitHub answered 503']])
  })
})
