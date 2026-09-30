// The measure step for public comments: read each Product's new comments
// from its social channel, label their sentiment, and write one draft
// Insight with the counts and quotes (Decision D22). The comments stay in
// the channel; Glue stores only the Insight.
import { and, eq, isNotNull } from 'drizzle-orm'

import type { ConceptDb } from '../db/client.ts'
import { addCommentInsight } from '../db/concept-records.ts'
import { products } from '../db/schema.ts'
import { SENTIMENTS } from './sentiment.ts'
import type {
  Sentiment,
  SentimentClassifier,
  SentimentScore,
} from './sentiment.ts'
import type { SocialChannel, SocialComment } from './social-channel.ts'

// Longest quote in the Insight, in characters.
const MAX_QUOTE_LENGTH = 280

// Quotes in this order: what to fix first.
const QUOTE_ORDER: Sentiment[] = ['negative', 'neutral', 'positive']

// A comment gets a few seconds to show up in the channel: a comment written
// at a time is readable only a moment later. Reading up to 10 seconds before
// now misses none.
const SETTLE_MS = 10_000

// Markdown characters in a comment that could make a link, an image, HTML,
// code or a table cell in the Insight.
const MARKDOWN_CHARACTERS = /[\\`*_[\]<>|~]/g

export type CommentInsight = {
  product: string
  // null in a dry run: nothing was written.
  id: string | null
  title: string
  source: string
  body: string
}

// A Product whose comments were not measured, and why. Its read position
// stays, so the next run reads the comments again.
export type SkippedProduct = { product: string; reason: string }

export type CommentMeasureResult = {
  insights: CommentInsight[]
  skipped: SkippedProduct[]
}

type SocialProduct = {
  id: number
  slug: string
  handle: string
  readUntil: Date | null
}

type ScoredComment = SocialComment & SentimentScore

function formatDay(date: Date) {
  return date.toISOString().slice(0, 10)
}

async function listSocialProducts(
  db: ConceptDb,
  productSlug: string | undefined,
): Promise<SocialProduct[]> {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      handle: products.socialHandle,
      readUntil: products.commentsReadUntil,
    })
    .from(products)
    .where(
      and(
        isNotNull(products.socialHandle),
        productSlug === undefined ? undefined : eq(products.slug, productSlug),
      ),
    )
    .orderBy(products.id)
  return rows.flatMap(({ handle, ...row }) =>
    handle ? [{ ...row, handle }] : [],
  )
}

// Comment text as plain text on one line of the Insight's Markdown.
function formatPlainText(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(MARKDOWN_CHARACTERS, (character) => `\\${character}`)
}

function formatQuote({ sentiment, author, text }: ScoredComment) {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  const quote =
    oneLine.length > MAX_QUOTE_LENGTH
      ? `${oneLine.slice(0, MAX_QUOTE_LENGTH - 1)}…`
      : oneLine
  return `- ${sentiment}, ${formatPlainText(author)}: "${formatPlainText(quote)}"`
}

// The comment the model is surest about, per sentiment.
function listQuotes(scored: ScoredComment[]) {
  return QUOTE_ORDER.flatMap((sentiment) => {
    const matching = scored.filter((comment) => comment.sentiment === sentiment)
    if (matching.length === 0) return []
    const surest = matching.reduce((best, comment) =>
      comment.score > best.score ? comment : best,
    )
    return [formatQuote(surest)]
  })
}

function formatDraft(product: SocialProduct, scored: ScoredComment[]) {
  const { handle, readUntil } = product
  const first = scored[0].createdAt
  const until = scored[scored.length - 1].createdAt
  const counts = SENTIMENTS.map((sentiment) => ({
    sentiment,
    count: scored.filter((comment) => comment.sentiment === sentiment).length,
  }))
  const query = [
    ...(readUntil ? [`since=${readUntil.toISOString()}`] : []),
    `until=${until.toISOString()}`,
  ].join('&')
  const noun = scored.length === 1 ? 'comment' : 'comments'
  return {
    title: `Comments on ${handle}: ${counts.map(({ sentiment, count }) => `${count} ${sentiment}`).join(', ')}`,
    source: `mock-social://${handle}/comments?${query}`,
    body: [
      `${scored.length} new ${noun} on ${handle} from ${formatDay(first)} to ${formatDay(until)}.`,
      [
        '| Sentiment | Comments |',
        '| --- | --- |',
        ...counts.map(({ sentiment, count }) => `| ${sentiment} | ${count} |`),
      ].join('\n'),
      '## Quotes',
      listQuotes(scored).join('\n'),
    ].join('\n\n'),
  }
}

// The Insight about the Product's new comments, or null when there are none
// or an overlapping run counted them first.
async function measureProduct(
  options: {
    db: ConceptDb
    channel: SocialChannel
    classifier: SentimentClassifier
    now: Date
    dryRun: boolean
  },
  product: SocialProduct,
): Promise<CommentInsight | null> {
  const { db, channel, classifier, now, dryRun } = options
  const comments = await channel.fetchComments({
    handle: product.handle,
    since: product.readUntil,
    until: new Date(now.getTime() - SETTLE_MS),
  })
  if (comments.length === 0) return null
  const scores = await classifier.classify(
    comments.map((comment) => comment.text),
  )
  const scored = comments.map((comment, index) => ({
    ...comment,
    ...scores[index],
  }))
  const draft = formatDraft(product, scored)
  if (dryRun) return { product: product.slug, id: null, ...draft }
  // The channel may send only the oldest comments: the next run reads on
  // after the last one.
  const read = {
    from: product.readUntil,
    until: comments[comments.length - 1].createdAt,
  }
  const fields = {
    title: draft.title,
    source: draft.source,
    date: formatDay(now),
  }
  const id = await addCommentInsight(db, product.id, read, fields, draft.body)
  return id === null ? null : { product: product.slug, id, ...draft }
}

export async function measureComments(options: {
  db: ConceptDb
  channel: SocialChannel
  classifier: SentimentClassifier
  now: Date
  productSlug?: string
  dryRun?: boolean
}): Promise<CommentMeasureResult> {
  const { db, productSlug, dryRun = false } = options
  const insights: CommentInsight[] = []
  const skipped: SkippedProduct[] = []
  for (const product of await listSocialProducts(db, productSlug)) {
    try {
      const insight = await measureProduct({ ...options, dryRun }, product)
      if (insight) insights.push(insight)
    } catch (error) {
      skipped.push({
        product: product.slug,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { insights, skipped }
}
