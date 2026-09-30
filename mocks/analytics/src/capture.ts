import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'

import type { events } from './schema.ts'

const gunzipAsync = promisify(gunzip)

type EventRow = typeof events.$inferInsert
type JsonObject = Record<string, unknown>

// Largest body the capture API inflates to. posthog-js batches stay far below.
const MAX_PAYLOAD_BYTES = 20 * 1024 * 1024

// The first two bytes of every gzip stream.
const GZIP_MAGIC = [0x1f, 0x8b]

export class PayloadTooLargeError extends Error {}

// Reads a capture body the way posthog-js and posthog-node send it: gzip
// (found by its magic bytes, since posthog-js sends raw gzip as text/plain
// with no marker), a `data=` form field in base64, or plain JSON.
export async function parsePayload(request: Request): Promise<unknown> {
  const bytes = new Uint8Array(await request.arrayBuffer())
  const isGzip = bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1]
  const body = isGzip ? await inflate(bytes) : new TextDecoder().decode(bytes)

  const isForm =
    new URL(request.url).searchParams.get('compression') === 'base64' ||
    (request.headers.get('content-type') ?? '').includes(
      'application/x-www-form-urlencoded',
    )
  if (isGzip || !isForm) return JSON.parse(body)

  const data = new URLSearchParams(body).get('data') ?? ''
  const isJson = data.startsWith('{') || data.startsWith('[')
  return JSON.parse(
    isJson ? data : Buffer.from(data, 'base64').toString('utf8'),
  )
}

// Stops at MAX_PAYLOAD_BYTES, so a gzip bomb cannot fill the memory.
async function inflate(bytes: Uint8Array): Promise<string> {
  try {
    const inflated = await gunzipAsync(bytes, {
      maxOutputLength: MAX_PAYLOAD_BYTES,
    })
    return inflated.toString('utf8')
  } catch (error) {
    if (error instanceof RangeError) throw new PayloadTooLargeError()
    throw error
  }
}

// Turns a single event, an array of events or a `{ batch }` envelope into rows.
// Returns null when an event lacks its project key, name or distinct id.
export function toEventRows(payload: unknown, now: Date): EventRow[] | null {
  if (!isObject(payload) && !Array.isArray(payload)) return null
  const envelope: JsonObject = isObject(payload) ? payload : {}
  const items: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(envelope.batch)
      ? envelope.batch
      : [payload]

  const rows: EventRow[] = []
  for (const item of items) {
    if (!isObject(item)) return null
    const properties = isObject(item.properties) ? item.properties : {}
    const project =
      item.api_key ??
      item.token ??
      properties.token ??
      envelope.api_key ??
      envelope.token
    const distinctId = item.distinct_id ?? properties.distinct_id
    const timestamp = toTimestamp(item, now)
    if (
      typeof project !== 'string' ||
      typeof item.event !== 'string' ||
      (typeof distinctId !== 'string' && typeof distinctId !== 'number') ||
      !timestamp
    ) {
      return null
    }
    rows.push({
      project,
      name: item.event,
      distinctId: String(distinctId),
      timestamp,
      properties,
    })
  }
  return rows
}

// posthog-js sends `offset` (ms before sending) instead of a timestamp.
function toTimestamp(item: JsonObject, now: Date): Date | null {
  if (typeof item.timestamp === 'string') {
    const timestamp = new Date(item.timestamp)
    return Number.isNaN(timestamp.getTime()) ? null : timestamp
  }
  if (typeof item.offset === 'number') {
    return new Date(now.getTime() - item.offset)
  }
  return now
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
