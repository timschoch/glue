import { createMemoryServer } from '../src/test/server.ts'

// Ada picked an Ask of flexibeck: it waits for its study or its hand-back.
const memory = createMemoryServer({
  fetchMineAsks: () =>
    Promise.resolve([
      {
        id: 7,
        kind: 'insight',
        step: 'hand-back',
        part: {
          project: { slug: 'flexibeck', name: 'flexibeck' },
          id: 'I9',
          type: 'insight',
          title: 'Bakers plan a week ahead',
          trust: 'solid',
          concept: 'flexibeck',
        },
        project: { slug: 'glue', name: 'Glue' },
        question: null,
        askedBy: null,
        pickedBy: { name: 'Ada', email: 'ada@example.com' },
        handedBack: null,
        study: null,
        askedAt: '2026-10-03T12:00:00.000Z',
      },
    ]),
})

// A spec sets `holdAssign` in the window: the write of an assignment then
// never ends, so the page keeps the words of the write that runs.
export const server: typeof memory = {
  ...memory,
  assign: (...input) =>
    'holdAssign' in globalThis
      ? new Promise(() => {})
      : memory.assign(...input),
}
