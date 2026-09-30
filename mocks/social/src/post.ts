import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'

// `pnpm --filter mock-social post --handle <h> --file <comments.json>`:
// posts scripted comments for a role play, in file order. The file holds
// `[{ "author": "...", "text": "..." }]`.
const { values } = parseArgs({
  options: { handle: { type: 'string' }, file: { type: 'string' } },
})
const { handle, file } = values
if (!handle || !file) {
  throw new Error('Usage: post --handle <handle> --file <comments.json>')
}
const host = process.env.MOCK_SOCIAL_URL ?? 'http://localhost:4001'

const scripted: unknown = JSON.parse(await readFile(file, 'utf8'))
if (!Array.isArray(scripted)) {
  throw new Error(`${file} must hold an array of { author, text }`)
}

for (const comment of scripted as Array<{ author?: unknown; text?: unknown }>) {
  const response = await fetch(new URL('/api/comments', host), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      handle,
      author: comment.author,
      text: comment.text,
    }),
  })
  if (!response.ok) {
    throw new Error(
      `mock social answered ${response.status}: ${await response.text()}`,
    )
  }
}
console.log(`Posted ${scripted.length} comments for ${handle} to ${host}`)
