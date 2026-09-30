// A tool that holds public comments about a Product. Glue reads them to
// record their sentiment as draft Insights. The mock social client is the
// first one.
export type SocialComment = {
  author: string
  text: string
  createdAt: Date
}

// The comments of `handle` after `since` and up to `until`, oldest first.
// `since: null` reads from the first one. A channel may send only the oldest
// part; the reader goes on after the last comment it got.
export type CommentQuery = { handle: string; since: Date | null; until: Date }

export type SocialChannel = {
  fetchComments: (query: CommentQuery) => Promise<SocialComment[]>
}
