import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { VIEWPORTS, createBot, createRandom, getTimezone } from './bot.ts'
import type { Bot, Random } from './bot.ts'
import type { Action, Journey, Step } from './journey.ts'
import { listChoices, scanScreen } from './screen.ts'
import type { Screen } from './screen.ts'
import { choiceOverloadLeaveChance } from './rules/choice-overload.ts'
import { pickChoice } from './rules/default-effect.ts'
import { effortLeaveChance } from './rules/effort.ts'

export type Options = {
  /** URL where each bot starts. */
  target: string
  journey: Journey
  users: number
  seed: number
  concurrency?: number
}

export type StepCount = {
  intent: string
  /** Bots that found the step on the screen. */
  reached: number
  /** Bots that left because they did not find the step. */
  missing: number
}

export type Summary = {
  users: number
  steps: Array<StepCount>
  /** Bots that walked the whole journey. */
  finished: number
}

type Outcome = {
  /** Count of steps the bot found. */
  reached: number
  /** True when the bot left because the next step was not found. */
  missing: boolean
}

type Identity = { email: string; password: string }

const DEFAULT_CONCURRENCY = 4
const STEP_TIMEOUT_MS = 10_000
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
  let next = 0
  const work = async () => {
    while (next < users) {
      const index = next++
      const identity = {
        email: `bot-${seed}-${index}-${runId}@user-sim.test`,
        password: `user-sim-${runId}-${index}`,
      }
      outcomes[index] = await walk(browser, options, botSeeds[index], identity)
    }
  }
  try {
    const concurrency = Math.min(
      options.concurrency ?? DEFAULT_CONCURRENCY,
      users,
    )
    await Promise.all(Array.from({ length: concurrency }, work))
  } finally {
    await browser.close()
  }
  return {
    users,
    steps: journey.steps.map((step, index) => ({
      intent: step.intent,
      reached: outcomes.filter((outcome) => outcome.reached > index).length,
      missing: outcomes.filter(
        (outcome) => outcome.missing && outcome.reached === index,
      ).length,
    })),
    finished: outcomes.filter(
      (outcome) => outcome.reached === journey.steps.length && !outcome.missing,
    ).length,
  }
}

async function walk(
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
  const page = await context.newPage()
  page.setDefaultTimeout(STEP_TIMEOUT_MS)
  let reached = 0
  try {
    await page.goto(options.target)
    for (const step of options.journey.steps) {
      if (!(await isFound(page, step))) return { reached, missing: true }
      reached++
      const screen = await scanScreen(page)
      if (random() < leaveChance(screen, bot))
        return { reached, missing: false }
      for (const action of step.actions) {
        await act(page, action, { screen, bot, random, identity })
      }
      await page.waitForLoadState()
    }
    return { reached, missing: false }
  } catch {
    // An action the product did not accept: the bot cannot go on.
    return { reached, missing: true }
  } finally {
    // Unload handlers let the product's posthog-js flush its queue, like a closed tab.
    await page.close({ runBeforeUnload: true })
    await context.close()
  }
}

/** Two independent reasons to leave: 1 - (1 - a)(1 - b). */
function leaveChance(screen: Screen, bot: Bot): number {
  return (
    1 -
    (1 - choiceOverloadLeaveChance(screen.choices, bot)) *
      (1 - effortLeaveChance(screen, bot))
  )
}

async function isFound(page: Page, step: Step): Promise<boolean> {
  try {
    for (const action of step.actions) {
      await target(page, action).first().waitFor()
    }
    return true
  } catch {
    return false
  }
}

function target(page: Page, action: Action) {
  switch (action.kind) {
    case 'fill':
      return page.getByLabel(action.label)
    case 'click':
      return page.getByRole(action.role, { name: action.name })
    case 'choose':
      return page
        .getByRole('radio')
        .or(page.getByRole('option'))
        .or(page.getByRole('group').getByRole('button'))
  }
}

type Visit = { screen: Screen; bot: Bot; random: Random; identity: Identity }

async function act(page: Page, action: Action, visit: Visit): Promise<void> {
  switch (action.kind) {
    case 'fill': {
      const value = action.value
        .replaceAll('{email}', visit.identity.email)
        .replaceAll('{password}', visit.identity.password)
      await target(page, action).first().fill(value)
      return
    }
    case 'click':
      await target(page, action).first().click()
      return
    case 'choose': {
      const choices = await listChoices(page)
      const index = pickChoice(
        { choices: choices.length, preselected: visit.screen.preselected },
        visit.bot,
        visit.random,
      )
      await choices[index].click()
      return
    }
  }
}
