// Labels texts as positive, neutral or negative. The Hugging Face client is
// the first one; tests use a fake.
export const SENTIMENTS = ['positive', 'neutral', 'negative'] as const

export type Sentiment = (typeof SENTIMENTS)[number]

// The label and the model's confidence in it, from 0 to 1.
export type SentimentScore = { sentiment: Sentiment; score: number }

export type SentimentClassifier = {
  // One score per text, in the order of `texts`.
  classify: (texts: string[]) => Promise<SentimentScore[]>
}
