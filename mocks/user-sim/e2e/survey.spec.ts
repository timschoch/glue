import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'
import { simulate } from '../src/simulate.ts'
import type { Journey } from '../src/journey.ts'

const USERS = 40
const SEED = 1
const CONCURRENCY = 8
const TIMEOUT_MS = 90_000
const SCORES = [1, 2, 3, 4, 5, 6, 7]
const EXPERIENCES = ['Novice', 'Intermediate', 'Experienced']
const TECHNIQUES = ['Stretch and fold', 'Laminate the dough', 'Pre-shape']

type Answer = { experience: string; score: number; remark: string }

/** Sign up, a technical step with or without a demo, then the SEQ. */
function formatPage(url: URL, experience: string): string {
  const step = TECHNIQUES.map(
    (technique) =>
      `<h2>${technique}</h2>${
        url.searchParams.get('demo') === '1'
          ? `<figure><video controls></video><figcaption>${technique}, step by step</figcaption></figure>`
          : ''
      }`,
  ).join('')
  const demo = `<input type="hidden" name="demo" value="${url.searchParams.get('demo')}">`
  if (url.pathname === '/step') {
    return `${step}<form action="/survey">${demo}
      <input type="hidden" name="experience" value="${experience}">
      <button>Done</button></form>`
  }
  if (url.pathname === '/survey') {
    const radios = SCORES.map(
      (score) =>
        `<label><input type="radio" name="score" value="${score}" required> ${score}</label>`,
    ).join('')
    return `<form action="/thanks">${demo}
      <input type="hidden" name="experience" value="${experience}">
      <div role="radiogroup" aria-label="How easy was your first bake?">${radios}</div>
      <label>What was hard? <textarea name="comment"></textarea></label>
      <button>Send answer</button></form>`
  }
  if (url.pathname === '/thanks') return '<p role="status">Thank you</p>'
  const radios = EXPERIENCES.map(
    (name) =>
      `<label><input type="radio" name="experience" value="${name}" required> ${name}</label>`,
  ).join('')
  return `<h1>Sign up</h1><form action="/step">${demo}
    <div role="radiogroup" aria-label="How much baking experience do you have?">${radios}</div>
    <button>Create account</button></form>`
}

const journey: Journey = {
  product: 'fixture',
  steps: [
    {
      intent: 'sign up',
      actions: [
        { kind: 'answer', question: /experience/i, from: 'experience' },
        { kind: 'click', role: 'button', name: 'Create account' },
      ],
    },
    {
      intent: 'do the first step',
      actions: [{ kind: 'click', role: 'button', name: 'Done' }],
    },
    {
      intent: 'answer the survey',
      actions: [
        { kind: 'answer', question: /how easy/i, from: 'seq' },
        { kind: 'fill', label: /what was hard/i, value: '{remark}' },
        { kind: 'click', role: 'button', name: 'Send answer' },
      ],
    },
  ],
}

function getMean(values: Array<number>): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

test('bots answer the SEQ, and a technical step without a demo scores lower for novices @smoke', async () => {
  test.setTimeout(TIMEOUT_MS)
  const answers: Record<string, Array<Answer>> = { '0': [], '1': [] }
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture')
    const experience = url.searchParams.get('experience') ?? ''
    if (url.pathname === '/thanks') {
      answers[url.searchParams.get('demo') ?? '0'].push({
        experience,
        score: Number(url.searchParams.get('score')),
        // Like flexibeck, the form sends the Remark as `comment`.
        remark: url.searchParams.get('comment') ?? '',
      })
    }
    response.setHeader('content-type', 'text/html')
    response.end(formatPage(url, experience))
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const origin = `http://localhost:${(server.address() as AddressInfo).port}`

  try {
    const run = (demo: number) =>
      simulate({
        target: `${origin}/?demo=${demo}`,
        journey,
        users: USERS,
        seed: SEED,
        concurrency: CONCURRENCY,
      })
    const without = await run(0)
    const withDemo = await run(1)
    console.log(
      JSON.stringify({ without: without.survey, withDemo: withDemo.survey }),
    )

    // The product receives exactly what the summary counts.
    expect(answers['0']).toHaveLength(without.survey.answers)
    expect(without.survey.mean).toBeCloseTo(
      getMean(answers['0'].map((answer) => answer.score)),
    )
    expect(answers['0'].filter((answer) => answer.remark !== '')).toHaveLength(
      without.survey.remarks,
    )

    // Bots tell their own experience: all three levels show up.
    expect(new Set(answers['0'].map((answer) => answer.experience)).size).toBe(
      EXPERIENCES.length,
    )

    const noviceScores = (demo: '0' | '1') =>
      getMean(
        answers[demo]
          .filter((answer) => answer.experience === 'Novice')
          .map((answer) => answer.score),
      )
    expect(noviceScores('1')).toBeGreaterThan(noviceScores('0'))
    expect(answers['0'].map((answer) => answer.remark)).toContain(
      'A video of each step would help',
    )
  } finally {
    server.close()
  }
})
