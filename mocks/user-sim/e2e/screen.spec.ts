import { expect, test } from '@playwright/test'
import { scanScreen } from '../src/screen.ts'

test('scans choices, the preselected one, required inputs and text @smoke', async ({
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

  const screen = await scanScreen(page)

  expect(screen).toEqual({
    choices: 3,
    preselected: 1,
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

  const screen = await scanScreen(page)

  expect(screen.choices).toBe(2)
  expect(screen.preselected).toBe(1)
})
