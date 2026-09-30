// A tool that holds public comments about a Product. Glue reads them to
// record their sentiment as draft Insights. The mock social client is the
// first one.
export type SocialComment = {
  author: string
  text: string
  createdAt: Date
}

// The comments of `handle` after `since`, oldest first. `since: null` reads
// them all.
export type CommentQuery = { handle: string; since: Date | null }

export type SocialChannel = {
  fetchComments: (query: CommentQuery) => Promise<SocialComment[]>
}
