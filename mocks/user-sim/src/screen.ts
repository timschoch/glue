import type { Locator, Page } from 'playwright'
import type { ChoiceSet } from './rules/default-effect.ts'
import { listTechniques } from './rules/worked-example.ts'

/** What the rules see of a screen. Read from the accessibility tree, never from product source. */
export type Screen = {
  /** One entry per group of choices. Each group is a decision of its own. */
  choiceSets: Array<ChoiceSet>
  requiredInputs: number
  textLength: number
  /** Techniques the visible text names that no figure on the screen demos. */
  techniquesWithoutDemo: number
}

/** One group of choices on the screen. */
export type ChoiceGroup = {
  choices: Array<Locator>
  /** Index of the preselected choice, or null. */
  preselected: number | null
}

type ChoiceKind = {
  containers: Locator
  choices: (container: Locator) => Locator
  picked: (container: Locator) => Locator
}

function listChoiceKinds(page: Page): Array<ChoiceKind> {
  const radio = page.getByRole('radio')
  const toggle = page.getByRole('button').and(page.locator('[aria-pressed]'))
  const radios = (container: Locator) => container.getByRole('radio')
  const checkedRadio = (container: Locator) =>
    container.getByRole('radio', { checked: true })
  return [
    {
      containers: page.getByRole('radiogroup'),
      choices: radios,
      picked: checkedRadio,
    },
    {
      // A fieldset of radios. An outer fieldset around inner groups is left out.
      containers: page.getByRole('group').filter({
        has: radio,
        hasNot: page.getByRole('radiogroup').or(page.getByRole('group')),
      }),
      choices: radios,
      picked: checkedRadio,
    },
    {
      containers: page.getByRole('listbox'),
      choices: (container) => container.getByRole('option'),
      picked: (container) => container.getByRole('option', { selected: true }),
    },
    {
      containers: page
        .getByRole('group')
        .or(page.getByRole('toolbar'))
        .filter({ has: toggle }),
      choices: (container) =>
        container.getByRole('button').and(container.locator('[aria-pressed]')),
      picked: (container) => container.getByRole('button', { pressed: true }),
    },
  ]
}

/**
 * Groups of choices, in this order: radios of one radiogroup, radios of one
 * fieldset, options of one listbox, toggle buttons of one group or toolbar.
 * Plain buttons such as Continue or Cancel are never choices. Radio groups named
 * by one of `questions` are left out.
 */
export async function listChoiceGroups(
  page: Page,
  questions: Array<string | RegExp> = [],
): Promise<Array<ChoiceGroup>> {
  const isQuestion = async (container: Locator) => {
    for (const question of questions) {
      const group = page.getByRole('radiogroup', { name: question })
      if ((await container.and(group).count()) > 0) return true
    }
    return false
  }
  const groups: Array<ChoiceGroup> = []
  for (const kind of listChoiceKinds(page)) {
    for (const container of await kind.containers.all()) {
      if (await isQuestion(container)) continue
      const choices = await kind.choices(container).all()
      if (choices.length === 0) continue
      const picked = kind.picked(container)
      let preselected: number | null = null
      for (const [index, choice] of choices.entries()) {
        if ((await choice.and(picked).count()) > 0) {
          preselected = index
          break
        }
      }
      groups.push({ choices, preselected })
    }
  }
  return groups
}

/** `questions`: the radio groups the step answers, so they are no choices. */
export async function parseScreen(
  page: Page,
  questions: Array<string | RegExp> = [],
): Promise<Screen> {
  const groups = await listChoiceGroups(page, questions)
  const required = page
    .getByRole('textbox')
    .or(page.getByRole('combobox'))
    .or(page.getByRole('spinbutton'))
    .and(page.locator(':required, [aria-required="true"]'))
  const text = await page.locator('body').innerText()
  let techniquesWithoutDemo = 0
  for (const technique of listTechniques(text)) {
    // A demo is a figure named for the technique. A video counts inside such a
    // figure: the accessibility tree has no role for a bare video.
    const demos = page.getByRole('figure', { name: technique.pattern })
    if ((await demos.count()) === 0) techniquesWithoutDemo++
  }
  return {
    choiceSets: groups.map((group) => ({
      choices: group.choices.length,
      preselected: group.preselected,
    })),
    requiredInputs: await required.count(),
    textLength: text.length,
    techniquesWithoutDemo,
  }
}
