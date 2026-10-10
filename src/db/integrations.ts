// The Integrations of a Project (glue/D70): a member connects a tool of the
// team with its address and its key, and Glue reads the Signals of the tool
// with that key. The key is stored encrypted and no answer of this module
// holds it (glue/D71).
import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { decryptKey, encryptKey } from './integration-key.ts'
import { getProjectId } from './projects.ts'
import {
  IntegrationNotFoundError,
  InvalidRecordError,
  isUniqueViolation,
} from './record-errors.ts'
import * as schema from './schema.ts'
import type { IntegrationState } from './schema.ts'
import type { SignalSource, SourceSignal } from './signals.ts'

const { integrations, members } = schema

// The states of an Integration, for the callers outside src/db.
export const { integrationStates } = schema

// The seam to a tool of a team. An adapter reads the tool at the address
// with the key of the team. Its name in the list of the tools is the name
// of the Signal source that its Signals show under.
export type IntegrationTool = {
  // Why the address is none of the tool. Nothing: the address fits.
  findAddressProblem: (address: string) => string | undefined
  // The Signals at the address. A read that the tool refuses throws an
  // IntegrationReadError.
  listSignals: (address: string, key: string) => Promise<SourceSignal[]>
}

// The tool refused a read, and the reason names what to change: the
// address or the key.
export class IntegrationReadError extends Error {
  constructor(
    message: string,
    readonly place: 'address' | 'key',
  ) {
    super(message)
  }
}

// An Integration as each reader gets it. The key stays in the database:
// only its last four characters show.
export type Integration = {
  id: number
  tool: string
  address: string
  keyLastFour: string
  state: IntegrationState
  // The last read from the tool. `error`: why it failed.
  lastRead: {
    at: string
    signalCount: number | null
    error: string | null
  } | null
}

const LAST_CHARACTERS = 4
// The failed reads in a row that set an Integration to failed. One failed
// read can be the network or a limit of the tool, and it goes away.
const MAX_FAILED_READS = 3
// A shorter key would show too much of itself in its last four characters.
const MIN_KEY_LENGTH = 8
const MIN_SECRET_LENGTH = 32

export const integrationSchema = z.strictObject({
  tool: z.string({ error: 'An Integration needs a tool' }).meta({
    description: 'The name of the tool: github',
  }),
  address: z
    .string({ error: 'An Integration needs an address' })
    .trim()
    .min(1, { error: 'An Integration needs an address' })
    .meta({
      description: 'Where the tool is. github: a repository, owner/name',
    }),
  key: z
    .string({ error: 'An Integration needs a key' })
    .trim()
    .min(MIN_KEY_LENGTH, {
      error: `A key has at least ${MIN_KEY_LENGTH} characters`,
    })
    .meta({
      description:
        'The secret that reads from the tool. Glue stores it encrypted and gives it back to nobody',
    }),
})

export type NewIntegration = z.input<typeof integrationSchema>

type Row = typeof integrations.$inferSelect

// The Integration of a write, or the refusal with its first reason and the
// field of that reason.
function parseIntegration(input: NewIntegration) {
  const parsed = integrationSchema.safeParse(input)
  if (!parsed.success) {
    const { message, path } = parsed.error.issues[0]
    const [field] = path
    throw new InvalidRecordError(
      message,
      typeof field === 'string' ? { field } : undefined,
    )
  }
  return parsed.data
}

// One read from the tool. A read that fails is an answer for the member:
// the reason, and the field to change when the tool names one.
async function readSignals(
  tool: IntegrationTool,
  address: string,
  key: string,
) {
  try {
    return await tool.listSignals(address, key)
  } catch (error) {
    throw new InvalidRecordError(
      error instanceof Error ? error.message : String(error),
      error instanceof IntegrationReadError
        ? { field: error.place }
        : undefined,
    )
  }
}

const toDuplicateError = (address: string) =>
  new InvalidRecordError(`"${address}" is an Integration already`, {
    field: 'address',
  })

function toIntegration(row: Row): Integration {
  const { id, tool, address, keyLastFour, state } = row
  return {
    id,
    tool,
    address,
    keyLastFour,
    state,
    lastRead: row.lastReadAt && {
      at: row.lastReadAt.toISOString(),
      signalCount: row.lastReadSignalCount,
      error: row.lastReadError,
    },
  }
}

// What a member does with the Integrations of a Project. `secret` is the
// setting of the server that encrypts each key. `tools` has the adapter of
// each tool under its name. The server functions, the HTTP API and the CLI
// use these operations.
export function createIntegrationOperations({
  db,
  secret,
  tools,
  now = () => new Date(),
}: {
  db: ConceptDb
  secret: string | undefined
  tools: Readonly<Record<string, IntegrationTool>>
  now?: () => Date
}) {
  const listRows = (projectId: number) =>
    db
      .select()
      .from(integrations)
      .where(eq(integrations.projectId, projectId))
      .orderBy(asc(integrations.tool), asc(integrations.address))

  function getTool(name: string) {
    if (!Object.hasOwn(tools, name)) {
      const names = Object.keys(tools).join(', ')
      throw new InvalidRecordError(`"${name}" is no tool: ${names}`, {
        field: 'tool',
      })
    }
    return tools[name]
  }

  // Without the secret Glue stores no key, and opens none. A short secret
  // is one that a person can guess.
  function getSecret() {
    if (!secret)
      throw new InvalidRecordError(
        'This server cannot store a key. Its setting INTEGRATION_KEY_SECRET is missing.',
      )
    if (secret.length < MIN_SECRET_LENGTH)
      throw new InvalidRecordError(
        `This server cannot store a key. Its setting INTEGRATION_KEY_SECRET has fewer than ${MIN_SECRET_LENGTH} characters.`,
      )
    return secret
  }

  // The id of the member of the Project with the e-mail address.
  async function getMemberId(
    projectId: number,
    projectSlug: string,
    email: string,
  ) {
    const found = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.projectId, projectId),
          eq(sql`lower(${members.email})`, email.trim().toLowerCase()),
        ),
      )
    const member = found.at(0)
    if (!member)
      throw new InvalidRecordError(
        `${email.trim()} is no member of ${projectSlug}.`,
      )
    return member.id
  }

  // The Integration of the Project. One of another Project is not found.
  const ofProject = (projectId: number, id: number) =>
    and(eq(integrations.projectId, projectId), eq(integrations.id, id))

  async function update(
    projectSlug: string,
    id: number,
    values: Partial<typeof integrations.$inferInsert>,
  ) {
    const projectId = await getProjectId(db, projectSlug)
    const rows = await db
      .update(integrations)
      .set(values)
      .where(ofProject(projectId, id))
      .returning()
    const updated = rows.at(0)
    if (!updated) throw new IntegrationNotFoundError(id)
    return toIntegration(updated)
  }

  // The Signals of the active Integrations of one tool. Each read keeps its
  // time and its count, or why it failed. One good read sets the count of
  // the failed reads back. The third failed read in a row marks the
  // Integration as failed, so the next read leaves it out (glue/D73).
  async function readActive(rows: Row[], tool: IntegrationTool) {
    const openSecret = getSecret()
    const signals: SourceSignal[] = []
    for (const row of rows.filter(({ state }) => state === 'active')) {
      const key = decryptKey(openSecret, row.encryptedKey)
      const byId = eq(integrations.id, row.id)
      try {
        const read = await tool.listSignals(row.address, key)
        await db
          .update(integrations)
          .set({
            lastReadAt: now(),
            lastReadSignalCount: read.length,
            lastReadError: null,
            failedReadCount: 0,
          })
          .where(byId)
        signals.push(...read)
      } catch (error) {
        await db
          .update(integrations)
          .set({
            state: sql`case when ${integrations.failedReadCount} + 1 >= ${MAX_FAILED_READS} then 'failed' else ${integrations.state} end`,
            failedReadCount: sql`${integrations.failedReadCount} + 1`,
            lastReadAt: now(),
            lastReadSignalCount: null,
            lastReadError:
              error instanceof Error ? error.message : String(error),
          })
          .where(byId)
        throw error
      }
    }
    return signals
  }

  // The Integration of the Project with its stored row.
  async function getRow(projectSlug: string, id: number) {
    const projectId = await getProjectId(db, projectSlug)
    const rows = await db
      .select()
      .from(integrations)
      .where(ofProject(projectId, id))
    const row = rows.at(0)
    if (!row) throw new IntegrationNotFoundError(id)
    return row
  }

  return {
    // The Integrations of the Project, by tool and address.
    async list(projectSlug: string): Promise<Integration[]> {
      const rows = await listRows(await getProjectId(db, projectSlug))
      return rows.map(toIntegration)
    },

    // The failed Integrations that the member with the e-mail address is
    // Responsible for (glue/D73). They leave the list when a member starts
    // them again and the read works.
    async listMine(
      projectSlug: string,
      memberEmail: string,
    ): Promise<Integration[]> {
      const rows = await db
        .select({ integration: integrations })
        .from(integrations)
        .innerJoin(members, eq(integrations.responsibleMemberId, members.id))
        .where(
          and(
            eq(integrations.projectId, await getProjectId(db, projectSlug)),
            eq(integrations.state, 'failed'),
            eq(sql`lower(${members.email})`, memberEmail.trim().toLowerCase()),
          ),
        )
        .orderBy(asc(integrations.tool), asc(integrations.address))
      return rows.map(({ integration }) => toIntegration(integration))
    },

    // Reads from the tool one time as a test. Only a read that works saves
    // the Integration. `responsible` is the e-mail address of the member who
    // adds it: that member is its Responsible.
    async add(
      projectSlug: string,
      input: NewIntegration,
      responsible?: string,
    ) {
      const { tool: name, address, key } = parseIntegration(input)
      const tool = getTool(name)
      const problem = tool.findAddressProblem(address)
      if (problem) throw new InvalidRecordError(problem, { field: 'address' })
      const openSecret = getSecret()
      const projectId = await getProjectId(db, projectSlug)
      const responsibleMemberId =
        responsible === undefined
          ? undefined
          : await getMemberId(projectId, projectSlug, responsible)
      const rows = await listRows(projectId)
      if (rows.some((row) => row.tool === name && row.address === address))
        throw toDuplicateError(address)
      const signals = await readSignals(tool, address, key)
      // A second add of the address at the same time passed the check
      // above: the unique rule of the table refuses it.
      const [added] = await db
        .insert(integrations)
        .values({
          projectId,
          tool: name,
          address,
          encryptedKey: encryptKey(openSecret, key),
          keyLastFour: key.slice(-LAST_CHARACTERS),
          state: 'active',
          lastReadAt: now(),
          lastReadSignalCount: signals.length,
          responsibleMemberId,
        })
        .returning()
        .catch((error: unknown) => {
          if (isUniqueViolation(error)) throw toDuplicateError(address)
          throw error
        })
      return toIntegration(added)
    },

    // Glue reads the tool no more. The key stays.
    pause: (projectSlug: string, id: number) =>
      update(projectSlug, id, { state: 'paused' }),

    // Reads from the tool one time with the stored key. Only a read that
    // works makes the Integration active again.
    async start(projectSlug: string, id: number) {
      const row = await getRow(projectSlug, id)
      const key = decryptKey(getSecret(), row.encryptedKey)
      const signals = await readSignals(getTool(row.tool), row.address, key)
      return update(projectSlug, id, {
        state: 'active',
        lastReadAt: now(),
        lastReadSignalCount: signals.length,
        lastReadError: null,
        failedReadCount: 0,
      })
    },

    // Gives the Integration a new key. Reads from the tool one time with
    // it: only a read that works saves it, in the place of the old key, and
    // makes the Integration active.
    async setKey(projectSlug: string, id: number, input: string) {
      const parsed = integrationSchema.shape.key.safeParse(input)
      if (!parsed.success)
        throw new InvalidRecordError(parsed.error.issues[0].message, {
          field: 'key',
        })
      const key = parsed.data
      const openSecret = getSecret()
      const row = await getRow(projectSlug, id)
      const signals = await readSignals(getTool(row.tool), row.address, key)
      return update(projectSlug, id, {
        encryptedKey: encryptKey(openSecret, key),
        keyLastFour: key.slice(-LAST_CHARACTERS),
        state: 'active',
        lastReadAt: now(),
        lastReadSignalCount: signals.length,
        lastReadError: null,
        failedReadCount: 0,
      })
    },

    // Deletes the Integration with its key.
    async remove(projectSlug: string, id: number) {
      const projectId = await getProjectId(db, projectSlug)
      const removed = await db
        .delete(integrations)
        .where(ofProject(projectId, id))
        .returning({ id: integrations.id })
      if (removed.length === 0) throw new IntegrationNotFoundError(id)
    },

    // The Signal sources as the Project reads them. A source with the name
    // of a tool reads the active Integrations of that tool with their keys.
    // A Project with no Integration of the tool keeps the source as it is.
    // A tool with no source of the server gets its own source, so a new
    // tool needs no entry in the sources.
    toSources(
      projectSlug: string,
      sources: ReadonlyArray<SignalSource>,
    ): ReadonlyArray<SignalSource> {
      const toToolSource = (
        name: string,
        serverSource?: SignalSource,
      ): SignalSource => ({
        name,
        async listSignals(project) {
          const projectId = await getProjectId(db, projectSlug)
          const rows = (await listRows(projectId)).filter(
            (row) => row.tool === name,
          )
          if (rows.length === 0)
            return serverSource ? serverSource.listSignals(project) : []
          return readActive(rows, tools[name])
        },
      })
      const sourceNames = new Set(sources.map(({ name }) => name))

      return [
        ...sources.map((source) =>
          Object.hasOwn(tools, source.name)
            ? toToolSource(source.name, source)
            : source,
        ),
        ...Object.keys(tools)
          .filter((name) => !sourceNames.has(name))
          .map((name) => toToolSource(name)),
      ]
    },
  }
}

export type IntegrationOperations = ReturnType<
  typeof createIntegrationOperations
>
