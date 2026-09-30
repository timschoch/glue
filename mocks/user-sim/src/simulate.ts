import { chromium } from 'playwright'
import type { Browser, Page, Request } from 'playwright'
import { VIEWPORTS, createBot, createRandom, getTimezone } from './bot.ts'
import type { Bot, Random } from './bot.ts'
import type { Action, Journey, Step } from './journey.ts'
import { listChoiceGroups, parseScreen } from './screen.ts'
import type { Screen } from './screen.ts'
import { toSummary } from './summary.ts'
import type { Outcome, Summary } from './summary.ts'
import { choiceOverloadLeaveChance } from './rules/choice-overload.ts'
import { getChoice } from './rules/default-effect.ts'
import { effortLeaveChance } from './rules/effort.ts'

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
  let step = 0
  try {
    await page.goto(options.target)
    for (const [index, current] of options.journey.steps.entries()) {
      step = index
      if (!(await isFound(page, current))) return { end: 'missing', step }
      const screen = await parseScreen(page)
      if (random() < leaveChance(screen, bot)) return { end: 'left', step }
      for (const action of current.actions) {
        await handleAction(page, action, { bot, random, identity })
      }
      await page.waitForLoadState()
    }
    return { end: 'finished', step }
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

/** Independent reasons to leave: 1 - (1 - a)(1 - b)... per choice set and effort. */
function leaveChance(screen: Screen, bot: Bot): number {
  const stay = screen.choiceSets.reduce(
    (product, set) =>
      product * (1 - choiceOverloadLeaveChance(set.choices, bot)),
    1 - effortLeaveChance(screen, bot),
  )
  return 1 - stay
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
  }
}

type Visit = { bot: Bot; random: Random; identity: Identity }

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
      await getLocator(page, action).first().fill(value)
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
