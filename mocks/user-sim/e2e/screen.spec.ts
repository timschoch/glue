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
    techniquesWithoutDemo: 0,
  })
  expect(screen.textLength).toBeLessThan(60)
})

test('counts the techniques on the screen that have no demo @smoke', async ({
  page,
}) => {
  await page.setContent(`
    <h2>Stretch and fold</h2>
    <ol><li>Shape</li><li>Bake</li></ol>`)

  expect((await parseScreen(page)).techniquesWithoutDemo).toBe(2)
})

test('a figure or a video in a figure named for a technique is its demo @smoke', async ({
  page,
}) => {
  await page.setContent(`
    <h2>Stretch and fold</h2>
    <figure><img src="fold.png" alt=""><figcaption>Stretch and fold, step by step</figcaption></figure>
    <h2>Shape</h2>
    <figure aria-label="How to shape the dough"><video controls></video></figure>
    <h2>Lamination</h2>
    <figure><img src="dough.png" alt=""></figure>`)

  expect((await parseScreen(page)).techniquesWithoutDemo).toBe(1)
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
