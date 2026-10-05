import { describe, expect, it } from 'vitest'

import { createApp } from './create-app.ts'

const tickets = [
  {
    id: 1,
    subject: 'I cannot find why a Decision was made',
    description: 'The ticket has no link to its Decision.',
    status: 'open',
    created_at: '2026-09-22T09:14:00Z',
  },
  {
    id: 2,
    subject: 'The export has no Guardrails',
    description: 'Our agent reads the export and misses the rules.',
    status: 'solved',
    created_at: '2026-09-24T13:02:00Z',
  },
] as const

describe('GET /api/v2/tickets.json', () => {
  it('lists the tickets like the help desk does, each with its address', async () => {
    const app = createApp({ tickets })

    const response = await app.request(
      'https://support.test/api/v2/tickets.json',
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      tickets: [
        {
          id: 1,
          url: 'https://support.test/api/v2/tickets/1.json',
          subject: 'I cannot find why a Decision was made',
          description: 'The ticket has no link to its Decision.',
          status: 'open',
          created_at: '2026-09-22T09:14:00Z',
        },
        {
          id: 2,
          url: 'https://support.test/api/v2/tickets/2.json',
          subject: 'The export has no Guardrails',
          description: 'Our agent reads the export and misses the rules.',
          status: 'solved',
          created_at: '2026-09-24T13:02:00Z',
        },
      ],
      next_page: null,
      previous_page: null,
      count: 2,
    })
  })

  it('is seeded with ten tickets', async () => {
    const response = await createApp().request('/api/v2/tickets.json')

    const { tickets: seeded, count } = (await response.json()) as {
      tickets: Array<{ id: number }>
      count: number
    }
    expect(count).toBe(10)
    expect(seeded.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})

describe('GET /agent/tickets/{id}', () => {
  it('shows the ticket as a page', async () => {
    const response = await createApp({ tickets }).request('/agent/tickets/2')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=UTF-8',
    )
    const page = await response.text()
    expect(page).toContain('<h1>The export has no Guardrails</h1>')
    expect(page).toContain(
      '<p>Our agent reads the export and misses the rules.</p>',
    )
  })

  it('escapes the text of the ticket', async () => {
    const app = createApp({
      tickets: [{ ...tickets[0], subject: 'A <b> tag & more' }],
    })

    const page = await (await app.request('/agent/tickets/1')).text()

    expect(page).toContain('<h1>A &lt;b&gt; tag &amp; more</h1>')
  })

  it('answers 404 to a ticket that it does not have', async () => {
    const response = await createApp({ tickets }).request('/agent/tickets/9')

    expect(response.status).toBe(404)
  })
})
