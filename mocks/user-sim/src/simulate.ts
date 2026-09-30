import { chromium } from 'playwright'
import type { Browser, Page, Request } from 'playwright'
import { VIEWPORTS, createBot, createRandom, getTimezone } from './bot.ts'
import type { Bot, Random } from './bot.ts'
import type { Action, Journey, Step } from './journey.ts'
import { listChoiceGroups, parseScreen } from './screen.ts'
import {
  NO_STRUGGLE,
  addStruggle,
  getStruggle,
  toLeaveChance,
} from './struggle.ts'
import type { Struggle } from './struggle.ts'
import { toSummary } from './summary.ts'
import type { Outcome, Summary } from './summary.ts'
import { getAnswer } from './survey.ts'
import type { Answer } from './survey.ts'
import { getChoice } from './rules/default-effect.ts'

export type Options = {
  /** URL where each bot starts. */
  target: string
  journey: Journey
  users: number
  seed: number
  concurrency?: number
}

type Identity = { email: string; password: string }

const DEFAULT_CONCURRENCY = 4
const STEP_TIMEOUT_MS = 10_000
/** How long a closed page gets to finish its last requests. */
const FLUSH_TIMEOUT_MS = 5_000
const FLUSH_POLL_MS = 50
const SEED_RANGE = 2 ** 32

export async function simulate(options: Options): Promise<Summary> {
  const { journey, users, seed } = options
  const seeds = createRandom(seed)
  const botSeeds = Array.from({ length: users }, () =>
    Math.floor(seeds() * SEED_RANGE),
  )
  // Emails must be new on every run against a live product; behaviour does not read them.
  const runId = Date.now().toString(36)
  const outcomes: Array<Outcome> = []
  const browser = await chromium.launch()
  const concurrency = Math.min(
    options.concurrency ?? DEFAULT_CONCURRENCY,
    users,
  )
  let next = 0
  try {
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (next < users) {
          const index = next++
          const identity = {
            email: `bot-${seed}-${index}-${runId}@user-sim.test`,
            password: `user-sim-${runId}-${index}`,
          }
          outcomes[index] = await fetchOutcome(
            browser,
            options,
            botSeeds[index],
            identity,
          )
        }
      }),
    )
  } finally {
    await browser.close()
  }
  return toSummary(
    journey.steps.map((step) => step.intent),
    outcomes,
  )
}

/** Walks one bot through the journey in its own browser context. */
async function fetchOutcome(
  browser: Browser,
  options: Options,
  botSeed: number,
  identity: Identity,
): Promise<Outcome> {
  const random = createRandom(botSeed)
  const bot = createBot(random)
  const context = await browser.newContext({
    viewport: VIEWPORTS[bot.device],
    isMobile: bot.device === 'mobile',
    hasTouch: bot.device === 'mobile',
    timezoneId: getTimezone(bot.hour, new Date()),
  })
  const pending = new Set<Request>()
  context.on('request', (request) => pending.add(request))
  context.on('requestfinished', (request) => pending.delete(request))
  context.on('requestfailed', (request) => pending.delete(request))
  const page = await context.newPage()
  page.setDefaultTimeout(STEP_TIMEOUT_MS)
  const visit: Visit = { bot, random, identity, struggle: NO_STRUGGLE }
  let step = 0
  try {
    await page.goto(options.target)
    for (const [index, current] of options.journey.steps.entries()) {
      step = index
      if (!(await isFound(page, current))) return { end: 'missing', step }
      const struggle = getStruggle(await parseScreen(page), bot)
      if (random() < toLeaveChance(struggle)) return { end: 'left', step }
      visit.struggle = addStruggle(visit.struggle, struggle)
      for (const action of current.actions) {
        await handleAction(page, action, visit)
      }
      await page.waitForLoadState()
    }
    return { end: 'finished', step, answer: visit.answer }
  } catch {
    return { end: 'error', step }
  } finally {
    // Leave like a closed tab: pagehide lets the product's posthog-js send its
    // queue. Then wait until those requests are done, or the time is up.
    await page.goto('about:blank').catch(() => undefined)
    const deadline = Date.now() + FLUSH_TIMEOUT_MS
    while (pending.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, FLUSH_POLL_MS))
    }
    await context.close()
  }
}

async function isFound(page: Page, step: Step): Promise<boolean> {
  try {
    for (const action of step.actions) {
      await getLocator(page, action).first().waitFor()
    }
    return true
  } catch {
    return false
  }
}

function getLocator(page: Page, action: Action) {
  switch (action.kind) {
    case 'fill':
      return page.getByLabel(action.label)
    case 'click':
      return page.getByRole(action.role, { name: action.name })
    case 'choose':
      return page
        .getByRole('radio')
        .or(page.getByRole('option'))
        .or(page.getByRole('button').and(page.locator('[aria-pressed]')))
    case 'answer':
      return page.getByRole('radiogroup', { name: action.question })
  }
}

type Visit = {
  bot: Bot
  random: Random
  identity: Identity
  /** The struggle of the walk so far. */
  struggle: Struggle
  /** Set once the bot answers the survey. */
  answer?: Answer
}

/** The bot answers the survey once, from the struggle of its walk so far. */
function getSurveyAnswer(visit: Visit): Answer {
  visit.answer ??= getAnswer(visit.struggle, visit.random)
  return visit.answer
}

async function handleAction(
  page: Page,
  action: Action,
  visit: Visit,
): Promise<void> {
  switch (action.kind) {
    case 'fill': {
      const value = action.value
        .replaceAll('{email}', visit.identity.email)
        .replaceAll('{password}', visit.identity.password)
        .replaceAll('{comment}', () => getSurveyAnswer(visit).comment)
      await getLocator(page, action).first().fill(value)
      return
    }
    case 'answer': {
      const radios = await getLocator(page, action)
        .first()
        .getByRole('radio')
        .all()
      const index =
        action.from === 'experience'
          ? Math.min(
              radios.length - 1,
              Math.floor(visit.bot.experience * radios.length),
            )
          : getSurveyAnswer(visit).score - 1
      if (!radios[index]) throw new Error(`No answer ${index + 1}`)
      await radios[index].check()
      return
    }
    case 'click':
      await getLocator(page, action).first().click()
      return
    case 'choose': {
      const groups = await listChoiceGroups(page)
      if (groups.length === 0) throw new Error('No choices on the screen')
      for (const group of groups) {
        const index = getChoice(
          { choices: group.choices.length, preselected: group.preselected },
          visit.bot,
          visit.random,
        )
        await group.choices[index].click()
      }
      return
    }
  }
}
