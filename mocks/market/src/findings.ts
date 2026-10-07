// A finding as the list call of the market analysis gives it, without its
// address.
export type Finding = {
  id: number
  title: string
  summary: string
  published_at: string
}

// What an analysis of the market of a team that works with Glue found.
export const seededFindings: ReadonlyArray<Finding> = [
  {
    id: 1,
    title: 'Teams keep the reason for a choice in chat',
    summary:
      'Six of ten product teams in the sample write the reason for a choice only in chat. After three months they cannot find it.',
    published_at: '2026-09-18T08:00:00Z',
  },
  {
    id: 2,
    title: 'Coding agents get rules as free text',
    summary:
      'Teams give their coding agents the rules of the product as a text file. No tool in the sample checks a build against these rules.',
    published_at: '2026-09-22T08:00:00Z',
  },
  {
    id: 3,
    title: 'Research tools do not link a finding to a choice',
    summary:
      'The four research tools in the sample store findings. None of them shows which choice a finding led to.',
    published_at: '2026-09-25T08:00:00Z',
  },
  {
    id: 4,
    title: 'Small teams pay for five tools that hold the why',
    summary:
      'A team of ten pays for a wiki, a tracker, a research tool, an analytics tool and a design tool. Each tool holds a part of the reason for a feature.',
    published_at: '2026-09-29T08:00:00Z',
  },
  {
    id: 5,
    title: 'Two rivals added a list of decisions this quarter',
    summary:
      'Two tools for product teams added a list of decisions in the last three months. Both lists are free text with no link to evidence.',
    published_at: '2026-10-01T08:00:00Z',
  },
  {
    id: 6,
    title: 'Buyers ask for proof that the agent followed the rules',
    summary:
      'In twelve of twenty sales calls the buyer asked how the team can prove that its coding agent followed the rules of the product.',
    published_at: '2026-10-05T08:00:00Z',
  },
]
