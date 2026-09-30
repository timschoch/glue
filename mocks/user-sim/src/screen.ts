import type { Locator, Page } from 'playwright'

/** What the rules see of a screen. Read from the accessibility tree, never from product source. */
export type Screen = {
  choices: number
  /** Index of the preselected choice, or null. */
  preselected: number | null
  requiredInputs: number
  textLength: number
}

type ChoiceGroup = { choices: Locator; picked: Locator }

/** The choices of the screen: radios, else options, else buttons in a group. */
async function findChoiceGroup(page: Page): Promise<ChoiceGroup | null> {
  const groups: Array<ChoiceGroup> = [
    {
      choices: page.getByRole('radio'),
      picked: page.getByRole('radio', { checked: true }),
    },
    {
      choices: page.getByRole('option'),
      picked: page.getByRole('option', { selected: true }),
    },
    {
      choices: page.getByRole('group').getByRole('button'),
      picked: page.getByRole('group').getByRole('button', { pressed: true }),
    },
  ]
  for (const group of groups) {
    if ((await group.choices.count()) > 0) return group
  }
  return null
}

export async function listChoices(page: Page): Promise<Array<Locator>> {
  const group = await findChoiceGroup(page)
  return group ? group.choices.all() : []
}

export async function scanScreen(page: Page): Promise<Screen> {
  const group = await findChoiceGroup(page)
  const choices = group ? await group.choices.all() : []
  let preselected: number | null = null
  for (const [index, choice] of choices.entries()) {
    if (group && (await choice.and(group.picked).count()) > 0) {
      preselected = index
      break
    }
  }
  const required = page
    .getByRole('textbox')
    .or(page.getByRole('combobox'))
    .or(page.getByRole('spinbutton'))
    .and(page.locator(':required, [aria-required="true"]'))
  return {
    choices: choices.length,
    preselected,
    requiredInputs: await required.count(),
    textLength: (await page.locator('body').innerText()).length,
  }
}
