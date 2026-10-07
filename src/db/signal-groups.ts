// The groups of Signals that say the same thing (glue/D54). A group is a
// proposal: a member turns it into a Hunch. Glue stores no group. It
// computes them each time it reads the Signals.
import type { Signal, SourceSignal } from './signals.ts'

export type SignalGroup = {
  // What its newest Signal is about.
  title: string
  // The addresses of its Signals, in the order of the list.
  signals: string[]
  // The names of the sources that gave them.
  sources: string[]
}

// Words that say nothing about the subject.
const STOP_WORDS = new Set(
  `about after again all also and any are because been before but can
  cannot could did does each for from had has have her here him his how into
  its just more most not now off once only other our out over same she
  should some such than that the their them then there these they
  this those too under until very was were what when where which while who
  why will with would you your`.split(/\s+/),
)

const MIN_WORD_LENGTH = 3
// Two Signals say the same thing when they share this many key words, and
// this share of the key words of the one that has more. So a short Signal
// is no partner of a long one that holds two of its words.
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

// What a person wrote to say what the Signal is about: its title, or its
// text when Glue gave it its title. The text under a title of a person is
// no part of it: it holds the words of the tool and of the steps, and two
// Signals about different things share those.
function toSubject({ title, titleBy, text }: SourceSignal) {
  return titleBy === 'glue' ? text : title
}

// The title of Signals taken together: the subject of the newest one, or
// its title when it has no subject.
export function toTitle(signals: ReadonlyArray<SourceSignal>) {
  const newest = signals.reduce((latest, signal) =>
    signal.date > latest.date ? signal : latest,
  )
  return toSubject(newest) || newest.title
}

// The groups of the Signals, in the order of the list. Two Signals say the
// same thing when their subjects share enough key words, or when they have
// the same subject. A Signal joins the first group in which each Signal
// says the same thing as it does, so a group is no chain. A Signal with no
// partner is in no group, and so are a Signal with no subject and a Signal
// that grew into an Insight.
//
// An index from each word to the Signals that hold it gives the partners of
// a Signal. No Signal is compared with a Signal that shares no word.
export function groupSignals(signals: ReadonlyArray<Signal>): SignalGroup[] {
  const worded = signals.map((signal) => {
    const words = listKeyWords(toSubject(signal))
    // The subject as its key words: `Too hard` and `too  hard` are one
    // subject.
    return { signal, subject: words.join(' '), words }
  })
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

  // The positions of the Signals before this one, by word and by subject.
  const byWord = new Map<string, number[]>()
  const bySubject = new Map<string, number[]>()
  const groups: number[][] = []
  const groupOf: number[] = []
  open.forEach(({ subject, words }, position) => {
    const shared = new Map<number, number>()
    for (const word of words) {
      for (const earlier of byWord.get(word) ?? []) {
        shared.set(earlier, (shared.get(earlier) ?? 0) + 1)
      }
    }
    const partners = new Set(subject ? bySubject.get(subject) : [])
    for (const [earlier, count] of shared) {
      const more = Math.max(words.length, open[earlier].words.length)
      if (count >= MIN_SHARED_WORDS && count >= MIN_SHARED_SHARE * more) {
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
    if (subject) addTo(bySubject, subject, position)
  })

  return groups
    .filter((members) => members.length > 1)
    .map((members) => members.map((member) => open[member].signal))
    .map((members) => ({
      title: toTitle(members),
      signals: members.map(({ url }) => url),
      sources: [...new Set(members.map(({ source }) => source))],
    }))
}
