import { describe, expect, it } from 'vitest'

import { createHuggingFaceClassifier } from './hugging-face.ts'

const TOKEN = 'hf_test'

// Answers each request with the top label per input, the shape the Hugging
// Face router sends for an array of inputs. Keeps the requests it got.
function createFakeFetch(labelOf: (text: string) => string) {
  const requests: Request[] = []
  const fakeFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    requests.push(request)
    const { inputs } = (await request.clone().json()) as { inputs: string[] }
    return Response.json([
      inputs.map((text) => ({ label: labelOf(text), score: 0.9 })),
    ])
  }
  return { fakeFetch, requests }
}

describe('createHuggingFaceClassifier', () => {
  it('labels each text with the model, in input order', async () => {
    const { fakeFetch, requests } = createFakeFetch((text) =>
      text.includes('love') ? 'positive' : 'negative',
    )
    const classifier = createHuggingFaceClassifier({
      token: TOKEN,
      fetch: fakeFetch,
    })

    const scores = await classifier.classify(['I love it', 'I hate it'])

    expect(scores).toEqual([
      { sentiment: 'positive', score: 0.9 },
      { sentiment: 'negative', score: 0.9 },
    ])
    const [request] = requests
    expect(request.method).toBe('POST')
    expect(request.url).toBe(
      'https://router.huggingface.co/hf-inference/models/cardiffnlp/twitter-roberta-base-sentiment-latest',
    )
    expect(request.headers.get('authorization')).toBe(`Bearer ${TOKEN}`)
  })

  it('sends many texts in batches and keeps their order', async () => {
    const { fakeFetch, requests } = createFakeFetch((text) =>
      Number(text) % 2 === 0 ? 'neutral' : 'positive',
    )
    const classifier = createHuggingFaceClassifier({
      token: TOKEN,
      fetch: fakeFetch,
    })
    const texts = Array.from({ length: 70 }, (_, index) => String(index))

    const scores = await classifier.classify(texts)

    expect(requests.length).toBeGreaterThan(1)
    expect(scores.map((score) => score.sentiment)).toEqual(
      texts.map((text) => (Number(text) % 2 === 0 ? 'neutral' : 'positive')),
    )
  })

  it('sends only the start of a long text, which the model can read', async () => {
    const { fakeFetch, requests } = createFakeFetch(() => 'positive')
    const classifier = createHuggingFaceClassifier({
      token: TOKEN,
      fetch: fakeFetch,
    })
    // 1 + 4n bytes: the cut at 500 bytes falls inside an emoji.
    const long = `x${'😍'.repeat(300)}`

    await classifier.classify([long, 'short'])

    const { inputs } = (await requests[0].json()) as { inputs: string[] }
    expect(new TextEncoder().encode(inputs[0]).length).toBeLessThanOrEqual(500)
    expect(inputs[0].length).toBeGreaterThan(100)
    expect(long.startsWith(inputs[0])).toBe(true)
    expect(inputs[1]).toBe('short')
  })

  it('throws with the status when the model does not answer', async () => {
    const classifier = createHuggingFaceClassifier({
      token: TOKEN,
      fetch: () =>
        Promise.resolve(
          Response.json({ error: 'Model is loading' }, { status: 503 }),
        ),
    })

    await expect(classifier.classify(['Hi'])).rejects.toThrow(/503/)
  })

  it('throws when the model answers with a label it does not know', async () => {
    const { fakeFetch } = createFakeFetch(() => 'LABEL_2')
    const classifier = createHuggingFaceClassifier({
      token: TOKEN,
      fetch: fakeFetch,
    })

    await expect(classifier.classify(['Hi'])).rejects.toThrow()
  })
})
