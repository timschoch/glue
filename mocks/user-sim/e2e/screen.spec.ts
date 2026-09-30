import { expect, test } from '@playwright/test'
import { parseScreen } from '../src/screen.ts'

test('parses choices, the preselected one, required inputs and text @smoke', async ({
  page,
}) => {
  await page.setContent(`
    <p>Bake on</p>
    <div role="radiogroup" aria-label="Day">
      <label><input type="radio" name="day"> Monday</label>
      <label><input type="radio" name="day" checked> Tuesday</label>
      <label><input type="radio" name="day"> Friday</label>
    </div>
    <label>Name <input required></label>
    <label>Oven <input aria-required="true"></label>
    <label>Note <input></label>
    <p hidden>Not on the screen</p>`)

  const screen = await parseScreen(page)

  expect(screen).toEqual({
    choiceSets: [{ choices: 3, preselected: 1 }],
    requiredInputs: 2,
    textLength: (await page.locator('body').innerText()).length,
  })
  expect(screen.textLength).toBeLessThan(60)
})

test('reads pressed buttons in a group as choices @smoke', async ({ page }) => {
  await page.setContent(`
    <div role="group" aria-label="Plan mode">
      <button aria-pressed="false">Relaxed</button>
      <button aria-pressed="true">Balanced</button>
    </div>`)

  const screen = await parseScreen(page)

  expect(screen.choiceSets).toEqual([{ choices: 2, preselected: 1 }])
})

test('a form in a fieldset with Continue and Cancel is no choice set @smoke', async ({
  page,
}) => {
  await page.setContent(`
    <form>
      <fieldset>
        <legend>Account</legend>
        <label>Email <input type="email"></label>
        <button>Continue</button>
        <button type="button">Cancel</button>
      </fieldset>
    </form>`)

  const screen = await parseScreen(page)

  expect(screen.choiceSets).toEqual([])
})

test('two radio groups count apart @smoke', async ({ page }) => {
  await page.setContent(`
    <fieldset>
      <legend>Day</legend>
      <label><input type="radio" name="day"> Monday</label>
      <label><input type="radio" name="day"> Tuesday</label>
      <label><input type="radio" name="day"> Friday</label>
    </fieldset>
    <div role="radiogroup" aria-label="Oven">
      <label><input type="radio" name="oven"> Gas</label>
      <label><input type="radio" name="oven" checked> Electric</label>
      <label><input type="radio" name="oven"> Wood</label>
      <label><input type="radio" name="oven"> Dutch oven</label>
    </div>
    <div role="listbox" aria-label="Flour">
      <div role="option" aria-selected="false">Rye</div>
      <div role="option" aria-selected="false">Spelt</div>
    </div>`)

  const screen = await parseScreen(page)

  expect(screen.choiceSets).toEqual([
    { choices: 4, preselected: 1 },
    { choices: 3, preselected: null },
    { choices: 2, preselected: null },
  ])
})
