// The measure step for public comments: read each Product's new comments
// from its social channel, label their sentiment, and write one draft
// Insight with the counts and quotes (Decision D22). The comments stay in
// the channel; Glue stores only the Insight.
import { and, eq, isNotNull, isNull } from 'drizzle-orm'

import type { ConceptDb } from '../db/client.ts'
import { addConceptRecord } from '../db/concept-records.ts'
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

export type CommentInsight = {
  product: string
  // null in a dry run: nothing was written.
  id: string | null
  title: string
  source: string
  body: string
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

// Moves the read position only when no other run moved it since `from`, so
// two overlapping runs count a comment once. True when it moved.
async function updateReadPosition(
  db: ConceptDb,
  productId: number,
  from: Date | null,
  to: Date | null,
) {
  const moved = await db
    .update(products)
    .set({ commentsReadUntil: to })
    .where(
      and(
        eq(products.id, productId),
        from === null
          ? isNull(products.commentsReadUntil)
          : eq(products.commentsReadUntil, from),
      ),
    )
    .returning({ id: products.id })
  return moved.length > 0
}

function formatQuote({ sentiment, author, text }: ScoredComment) {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  const quote =
    oneLine.length > MAX_QUOTE_LENGTH
      ? `${oneLine.slice(0, MAX_QUOTE_LENGTH - 1)}…`
      : oneLine
  return `- ${sentiment}, ${author}: "${quote}"`
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

// Writes the Insight after it moved the read position. Moves it back when the
// write fails, so the next run reads the comments again. null when an
// overlapping run counted the comments first.
async function addCommentInsight(
  db: ConceptDb,
  product: SocialProduct,
  until: Date,
  draft: { title: string; source: string; body: string },
  now: Date,
) {
  if (!(await updateReadPosition(db, product.id, product.readUntil, until))) {
    return null
  }
  const fields = {
    title: draft.title,
    source: draft.source,
    date: formatDay(now),
    status: 'draft',
  }
  try {
    return await addConceptRecord(
      db,
      product.slug,
      'insights',
      fields,
      draft.body,
    )
  } catch (error) {
    await updateReadPosition(db, product.id, until, product.readUntil)
    throw error
  }
}

export async function measureComments(options: {
  db: ConceptDb
  channel: SocialChannel
  classifier: SentimentClassifier
  now: Date
  productSlug?: string
  dryRun?: boolean
}): Promise<CommentInsight[]> {
  const { db, channel, classifier, now, productSlug, dryRun = false } = options
  const written: CommentInsight[] = []
  for (const product of await listSocialProducts(db, productSlug)) {
    const comments = await channel.fetchComments({
      handle: product.handle,
      since: product.readUntil,
    })
    if (comments.length === 0) continue
    const scores = await classifier.classify(
      comments.map((comment) => comment.text),
    )
    const scored = comments.map((comment, index) => ({
      ...comment,
      ...scores[index],
    }))
    const draft = formatDraft(product, scored)
    const until = comments[comments.length - 1].createdAt
    const id = dryRun
      ? null
      : await addCommentInsight(db, product, until, draft, now)
    if (!dryRun && id === null) continue
    written.push({ product: product.slug, id, ...draft })
  }
  return written
}
