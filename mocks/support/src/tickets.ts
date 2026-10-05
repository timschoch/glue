// A ticket as the list call of the help desk gives it, without its address.
export type Ticket = {
  id: number
  subject: string
  description: string
  status: 'new' | 'open' | 'pending' | 'solved'
  created_at: string
}

// What customers of a team that works with Glue wrote to its support.
export const seededTickets: ReadonlyArray<Ticket> = [
  {
    id: 1,
    subject: 'I cannot find why a Decision was made',
    description:
      'I opened a ticket of our build and wanted to read the reason for it. The ticket has no link to its Decision. I had to search by its title.',
    status: 'open',
    created_at: '2026-09-22T09:14:00Z',
  },
  {
    id: 2,
    subject: 'The export has no Guardrails',
    description:
      'Our coding agent reads the export of the Concept. The Guardrails are not in it, so the agent breaks them.',
    status: 'open',
    created_at: '2026-09-24T13:02:00Z',
  },
  {
    id: 3,
    subject: 'Sign-up mail never came',
    description:
      'I signed up yesterday with my work address. No mail came, also not in the spam folder.',
    status: 'solved',
    created_at: '2026-09-25T07:41:00Z',
  },
  {
    id: 4,
    subject: 'A Flagged record does not say what changed',
    description:
      'Three of my records are yellow. I see the reason "new version", but not what is new in that version.',
    status: 'open',
    created_at: '2026-09-26T15:20:00Z',
  },
  {
    id: 5,
    subject: 'How do I move a record to another Concept?',
    description:
      'I put an Insight into the wrong Concept. I do not find a way to move it in the app.',
    status: 'pending',
    created_at: '2026-09-28T10:05:00Z',
  },
  {
    id: 6,
    subject: 'The map is too small on my laptop',
    description:
      'With more than twenty records the cards of the map get so small that I cannot read the titles.',
    status: 'open',
    created_at: '2026-09-29T08:33:00Z',
  },
  {
    id: 7,
    subject: 'Can two people own one record?',
    description:
      'My colleague and I both answer for our onboarding flow. The app lets me pick one owner only.',
    status: 'new',
    created_at: '2026-09-30T16:48:00Z',
  },
  {
    id: 8,
    subject: 'I do not see what needs me today',
    description:
      'Mine shows forty records. I cannot tell which ones are urgent and which ones can wait.',
    status: 'open',
    created_at: '2026-10-01T11:27:00Z',
  },
  {
    id: 9,
    subject: 'The Contract page is slow',
    description:
      'It takes about eight seconds until the Contract of our largest Concept shows.',
    status: 'new',
    created_at: '2026-10-02T14:09:00Z',
  },
  {
    id: 10,
    subject: 'Our token stopped working',
    description:
      'Since this morning the HTTP API answers 401 to the token of our build agent. We did not revoke it.',
    status: 'new',
    created_at: '2026-10-03T06:55:00Z',
  },
]
