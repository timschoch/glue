import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page, Request } from 'playwright'
import { VIEWPORTS, createBot, createRandom, getTimezone } from './bot.ts'
import type { Bot, Random } from './bot.ts'
import { listQuestions } from './journey.ts'
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
import { getTraffic } from './traffic.ts'
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
/**
 * The route for the bot header delays the request event of a last-page beacon,
 * so the flush also waits for this long without a new request, like
 * Playwright's networkidle.
 */
const FLUSH_QUIET_MS = 500
const FLUSH_POLL_MS = 50
const SEED_RANGE = 2 ** 32
/** Tells the product that a bot, not a person, sends the request. */
const BOT_HEADER = 'x-glue-bot'
const TOO_MANY_REQUESTS = 429
const RATE_LIMIT_TEXT = /too many requests/i

export async function simulate(options: Options): Promise<Summary> {
  const { journey, seed } = options
  const { users, concurrency, startGapMs, caps } = getTraffic(
    options.target,
    options.users,
    options.concurrency ?? DEFAULT_CONCURRENCY,
  )
  for (const cap of caps) console.warn(`user-sim: capped ${cap}`)
  const seeds = createRandom(seed)
  const botSeeds = Array.from({ length: users }, () =>
    Math.floor(seeds() * SEED_RANGE),
  )
  // Emails must be new on every run against a live product; behaviour does not read them.
  const runId = Date.now().toString(36)
  const outcomes: Array<Outcome> = []
  const browser = await chromium.launch()
  let next = 0
  let nextStart = Date.now()
  try {
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (next < users) {
          const index = next++
          const start = Math.max(nextStart, Date.now())
          nextStart = start + startGapMs
          await new Promise((resolve) =>
            setTimeout(resolve, Math.max(0, start - Date.now())),
          )
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
  const network = await createNetwork(context, new URL(options.target).origin)
  const page = await context.newPage()
  page.setDefaultTimeout(STEP_TIMEOUT_MS)
  const visit: Visit = { bot, random, identity, struggle: NO_STRUGGLE }
  let step = 0
  try {
    await page.goto(options.target)
    for (const [index, current] of options.journey.steps.entries()) {
      step = index
      if (!(await isFound(page, current))) {
        // A rate limit is the product turning the bot away, not a missing step.
        const isRateLimited =
          network.isRateLimited ||
          (await page.getByText(RATE_LIMIT_TEXT).count()) > 0
        return { end: isRateLimited ? 'error' : 'missing', step }
      }
      const screen = await parseScreen(page, listQuestions(current))
      const struggle = getStruggle(screen, bot)
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
    network.lastRequestAt = Date.now()
    while (
      (network.pending.size > 0 ||
        Date.now() - network.lastRequestAt < FLUSH_QUIET_MS) &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, FLUSH_POLL_MS))
    }
    await context.close()
  }
}

/** What the bot sees of the traffic between its browser context and the product. */
type Network = {
  pending: Set<Request>
  lastRequestAt: number
  /** The product answered a request with HTTP 429. */
  isRateLimited: boolean
}

/** Adds the bot header to the product's requests and follows the context's traffic. */
async function createNetwork(
  context: BrowserContext,
  origin: string,
): Promise<Network> {
  // The bot header goes to the product's own origin only. On a cross-origin call,
  // for example to analytics, it would force a CORS preflight that fails.
  await context.route(
    (url) => url.origin === origin,
    (route) =>
      route.fallback({
        headers: { ...route.request().headers(), [BOT_HEADER]: '1' },
      }),
  )
  const network: Network = {
    pending: new Set(),
    lastRequestAt: 0,
    isRateLimited: false,
  }
  context.on('request', (request) => {
    network.pending.add(request)
    network.lastRequestAt = Date.now()
  })
  context.on('requestfinished', (request) => network.pending.delete(request))
  context.on('requestfailed', (request) => network.pending.delete(request))
  context.on('response', (response) => {
    if (
      response.status() === TOO_MANY_REQUESTS &&
      new URL(response.url()).origin === origin
    ) {
      network.isRateLimited = true
    }
  })
  return network
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
        .replaceAll('{remark}', () => getSurveyAnswer(visit).remark)
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
