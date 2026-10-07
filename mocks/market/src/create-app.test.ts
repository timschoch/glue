import { describe, expect, it } from 'vitest'

import { createApp } from './create-app.ts'

const findings = [
  {
    id: 1,
    title: 'Teams keep the reason for a choice in chat',
    summary: 'Six of ten teams cannot find the reason after three months.',
    published_at: '2026-09-18T08:00:00Z',
  },
  {
    id: 2,
    title: 'Coding agents get rules as free text',
    summary: 'No tool in the sample checks a build against its rules.',
    published_at: '2026-09-25T08:00:00Z',
  },
] as const

describe('GET /api/findings', () => {
  it('lists the findings, each with the address of its page', async () => {
    const app = createApp({ findings })

    const response = await app.request('https://market.test/api/findings')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      findings: [
        {
          id: 1,
          url: 'https://market.test/findings/1',
          title: 'Teams keep the reason for a choice in chat',
          summary:
            'Six of ten teams cannot find the reason after three months.',
          published_at: '2026-09-18T08:00:00Z',
        },
        {
          id: 2,
          url: 'https://market.test/findings/2',
          title: 'Coding agents get rules as free text',
          summary: 'No tool in the sample checks a build against its rules.',
          published_at: '2026-09-25T08:00:00Z',
        },
      ],
    })
  })

  it('is seeded with six findings', async () => {
    const response = await createApp().request('/api/findings')

    const { findings: seeded } = (await response.json()) as {
      findings: Array<{ id: number }>
    }
    expect(seeded.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('GET /findings/{id}', () => {
  it('shows the finding as a page', async () => {
    const response = await createApp({ findings }).request('/findings/2')

    expect(response.status).toBe(200)
    const page = await response.text()
    expect(page).toContain('<h1>Coding agents get rules as free text</h1>')
    expect(page).toContain(
      '<p>No tool in the sample checks a build against its rules.</p>',
    )
  })

  it('escapes the text of the finding', async () => {
    const app = createApp({
      findings: [{ ...findings[0], title: 'A <b> tag & more' }],
    })

    const page = await (await app.request('/findings/1')).text()

    expect(page).toContain('<h1>A &lt;b&gt; tag &amp; more</h1>')
  })

  it('answers 404 to a finding that it does not have', async () => {
    const response = await createApp({ findings }).request('/findings/9')

    expect(response.status).toBe(404)
  })
})
