// The groups of Signals that say the same thing (glue/D54). A group is a
// proposal: a member turns it into a Hunch. Glue stores no group. It
// computes them each time it reads the Signals.
import type { Signal } from './signals.ts'

export type SignalGroup = {
  // The addresses of its Signals, in the order of the list.
  signals: string[]
  // The names of the sources that gave them.
  sources: string[]
}

// Words that say nothing about the subject. `survey` and `answer` are the
// words of the title that Glue gives a survey answer.
const STOP_WORDS = new Set(
  `about after again all also and answer any are because been before but can
  cannot could did does each for from had has have her here him his how into
  its just more most not now off once only other our out over same she
  should some such survey than that the their them then there these they
  this those too under until very was were what when where which while who
  why will with would you your`.split(/\s+/),
)

const MIN_WORD_LENGTH = 3
// Two Signals say the same thing when they share this many key words, and
// this share of the key words of the one that has fewer.
const MIN_SHARED_WORDS = 2
const MIN_SHARED_SHARE = 0.5
// A word that many Signals of the Project share says nothing about one of
// them: a word in more than this share of the Signals, and in this many or
// more. In a short list no word is common, so a repeat stays a group there.
const COMMON_SHARE = 0.25
const MIN_COMMON_SIGNALS = 5

// The word without its ending, so `opens` and `open` are one word.
function toStem(word: string) {
  const stem = word.replace(/(ing|ed|ly|s)$/, '')
  return stem.length < MIN_WORD_LENGTH ? word : stem
}

// The words of a text that say something about the subject.
function listKeyWords(text: string): string[] {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? []
  return [
    ...new Set(
      words
        .filter(
          (word) => word.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(word),
        )
        .map(toStem),
    ),
  ]
}

// Puts a value into the list of its key.
function addTo<TValue>(
  lists: Map<string, TValue[]>,
  key: string,
  value: TValue,
) {
  const list = lists.get(key)
  if (list) list.push(value)
  else lists.set(key, [value])
}

// The groups of the Signals, in the order of the list. Two Signals say the
// same thing when they share enough key words, or when they have the same
// title. A Signal joins the first group in which each Signal says the same
// thing as it does, so a group is no chain. A Signal with no partner is in
// no group, and so is a Signal that grew into an Insight.
//
// An index from each word to the Signals that hold it gives the partners of
// a Signal. No Signal is compared with a Signal that shares no word.
export function groupSignals(signals: ReadonlyArray<Signal>): SignalGroup[] {
  const worded = signals.map((signal) => ({
    signal,
    // The title as its key words: `Too hard` and `too  hard` are one title.
    title: listKeyWords(signal.title).join(' '),
    words: listKeyWords(`${signal.title} ${signal.text}`),
  }))
  const counts = new Map<string, number>()
  for (const { words } of worded) {
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  const isCommon = (word: string) => {
    const count = counts.get(word) ?? 0
    return count >= MIN_COMMON_SIGNALS && count > COMMON_SHARE * signals.length
  }
  const open = worded
    .filter(({ signal }) => signal.insight === null)
    .map((entry) => ({
      ...entry,
      words: entry.words.filter((word) => !isCommon(word)),
    }))

  // The positions of the Signals before this one, by word and by title.
  const byWord = new Map<string, number[]>()
  const byTitle = new Map<string, number[]>()
  const groups: number[][] = []
  const groupOf: number[] = []
  open.forEach(({ title, words }, position) => {
    const shared = new Map<number, number>()
    for (const word of words) {
      for (const earlier of byWord.get(word) ?? []) {
        shared.set(earlier, (shared.get(earlier) ?? 0) + 1)
      }
    }
    const partners = new Set(title ? byTitle.get(title) : [])
    for (const [earlier, count] of shared) {
      const fewer = Math.min(words.length, open[earlier].words.length)
      if (count >= MIN_SHARED_WORDS && count >= MIN_SHARED_SHARE * fewer) {
        partners.add(earlier)
      }
    }
    const joined = [
      ...new Set([...partners].map((partner) => groupOf[partner])),
    ]
      .sort((first, second) => first - second)
      .find((group) => groups[group].every((member) => partners.has(member)))
    if (joined === undefined) groups.push([position])
    else groups[joined].push(position)
    groupOf.push(joined ?? groups.length - 1)

    for (const word of words) addTo(byWord, word, position)
    if (title) addTo(byTitle, title, position)
  })

  return groups
    .filter((members) => members.length > 1)
    .map((members) => ({
      signals: members.map((member) => open[member].signal.url),
      sources: [
        ...new Set(members.map((member) => open[member].signal.source)),
      ],
    }))
}
