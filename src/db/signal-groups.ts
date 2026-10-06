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

// The word without its ending, so `opens` and `open` are one word.
function toStem(word: string) {
  const stem = word.replace(/(ing|ed|ly|s)$/, '')
  return stem.length < MIN_WORD_LENGTH ? word : stem
}

// The key words of a Signal: the words of its title and its text that say
// something about the subject.
function listKeyWords({ title, text }: Signal): ReadonlySet<string> {
  const words = `${title} ${text}`.toLowerCase().match(/\p{L}+/gu) ?? []
  return new Set(
    words
      .filter((word) => word.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(word))
      .map(toStem),
  )
}

function saySame(first: ReadonlySet<string>, second: ReadonlySet<string>) {
  const shared = [...first].filter((word) => second.has(word)).length
  return (
    shared >= MIN_SHARED_WORDS &&
    shared >= MIN_SHARED_SHARE * Math.min(first.size, second.size)
  )
}

// The groups of the Signals, in the order of the list. A Signal is in the
// group of each Signal that says the same thing. A Signal with no partner
// is in no group, and so is a Signal that grew into an Insight.
export function groupSignals(signals: ReadonlyArray<Signal>): SignalGroup[] {
  const open = signals
    .filter(({ insight }) => insight === null)
    .map((signal) => ({ signal, words: listKeyWords(signal) }))
  // The group of each Signal: the position of its first Signal.
  const groupOf = open.map((_, index) => index)
  open.forEach((later, index) => {
    open.slice(0, index).forEach((earlier, partner) => {
      if (!saySame(earlier.words, later.words)) return
      const [kept, merged] = [groupOf[partner], groupOf[index]].sort(
        (first, second) => first - second,
      )
      groupOf.forEach((group, position) => {
        if (group === merged) groupOf[position] = kept
      })
    })
  })

  return open
    .map((_, first) => open.filter((__, index) => groupOf[index] === first))
    .filter((members) => members.length > 1)
    .map((members) => ({
      signals: members.map(({ signal }) => signal.url),
      sources: [...new Set(members.map(({ signal }) => signal.source))],
    }))
}
