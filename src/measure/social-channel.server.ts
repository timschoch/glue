import type { ConceptDb } from '../db/client.ts'
import { findSetting, getSetting } from '../settings.server.ts'
import { createHuggingFaceClassifier } from './hugging-face.ts'
import { measureComments } from './measure-comments.ts'
import type { CommentMeasureResult } from './measure-comments.ts'
import { createMockSocialChannel } from './mock-social.ts'

// The measure run over public comments, set up from the environment. Without
// MOCK_SOCIAL_URL no social channel is set up: null, nothing is read.
export async function measureSocialComments(options: {
  db: ConceptDb
  now: Date
  productSlug?: string
  dryRun?: boolean
}): Promise<CommentMeasureResult | null> {
  const url = findSetting('MOCK_SOCIAL_URL')
  if (!url) return null
  return measureComments({
    ...options,
    channel: createMockSocialChannel({
      url,
      readKey: getSetting('MOCK_SOCIAL_READ_KEY'),
    }),
    classifier: createHuggingFaceClassifier({ token: getSetting('HF_TOKEN') }),
  })
}
