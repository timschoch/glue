// The survey answers of the seed: one answer to the Single Ease Question
// (1 very hard to 7 very easy) each day, as posthog-js sends it.

const MILLISECONDS_PER_DAY = 86_400_000

// The seed runs one time. The answers after the day of the seed come into
// each read as the days pass, so a read of the last 30 days always has some.
const DAYS_BEFORE = 30
const DAYS_AFTER = 180

// One week of answers, with the words of the answer for a low score.
const answers = [
  { score: 2, remark: 'Too many options to pick from' },
  { score: 6, remark: '' },
  { score: 3, remark: '' },
  { score: 7, remark: '' },
  { score: 1, remark: 'I could not find where to start' },
  { score: 5, remark: '' },
  { score: 6, remark: '' },
]

export type SurveyEvent = {
  distinctId: string
  event: 'survey sent'
  timestamp: Date
  properties: { $survey_response: number; comment: string }
}

export function createSurveyEvents(now: Date): SurveyEvent[] {
  return Array.from({ length: DAYS_BEFORE + DAYS_AFTER }, (_, index) => {
    const { score, remark } = answers[index % answers.length]
    return {
      distinctId: `survey-user-${index}`,
      event: 'survey sent',
      timestamp: new Date(
        now.getTime() + (index - DAYS_BEFORE) * MILLISECONDS_PER_DAY,
      ),
      properties: { $survey_response: score, comment: remark },
    }
  })
}
