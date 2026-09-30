// The sentiment classifier on the free Hugging Face Inference API.
import { z } from 'zod'

import { createResponseError } from './response-error.ts'
import { SENTIMENTS } from './sentiment.ts'
import type { SentimentClassifier } from './sentiment.ts'

const DEFAULT_MODEL = 'cardiffnlp/twitter-roberta-base-sentiment-latest'

// Texts per request, so one request stays small.
const BATCH_SIZE = 32

// A cold model can take some seconds to load before it answers.
const TIMEOUT_MS = 30_000

// The model reads 512 tokens at most and answers 400 to a longer text. Its
// byte-level tokenizer makes one token per UTF-8 byte at most, so 500 bytes
// always fit, emoji included.
const MAX_INPUT_BYTES = 500

const encoder = new TextEncoder()

// The whole characters at the start of `text` that the model can read.
function readableStart(text: string) {
  let start = ''
  let byteCount = 0
  for (const character of text) {
    byteCount += encoder.encode(character).length
    if (byteCount > MAX_INPUT_BYTES) break
    start += character
  }
  return start
}

// For an array of inputs the router answers `[[top label per input]]`.
const labelsResponseSchema = z.tuple([
  z.array(z.object({ label: z.enum(SENTIMENTS), score: z.number() })),
])

export function createHuggingFaceClassifier(options: {
  token: string
  model?: string
  fetch?: typeof fetch
}): SentimentClassifier {
  const { token, model = DEFAULT_MODEL, fetch: send = fetch } = options
  const endpoint = `https://router.huggingface.co/hf-inference/models/${model}`

  async function classifyBatch(texts: string[]) {
    const response = await send(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ inputs: texts.map(readableStart) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      throw await createResponseError('Hugging Face', response)
    }
    const [labels] = labelsResponseSchema.parse(await response.json())
    if (labels.length !== texts.length) {
      throw new Error(
        `Hugging Face labelled ${labels.length} of ${texts.length} texts`,
      )
    }
    return labels.map(({ label, score }) => ({ sentiment: label, score }))
  }

  return {
    classify: async (texts) => {
      const scores = []
      for (let start = 0; start < texts.length; start += BATCH_SIZE) {
        scores.push(
          ...(await classifyBatch(texts.slice(start, start + BATCH_SIZE))),
        )
      }
      return scores
    },
  }
}
