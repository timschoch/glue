import { expect } from '@playwright/test'
import type { Locator } from '@playwright/test'

import { test } from './app.ts'

test.use({ viewport: { width: 320, height: 800 } })

const PART = 'glue/part-model/I3'

// A label as long as another language has it: it does not fit on one line.
const LONG_LABEL = 'The member who is responsible for this Part'

// Where the select and each checkbox of the group are.
function readPlaces(group: Locator) {
  return group.evaluate((box) =>
    [...box.querySelectorAll('select, input')].map((control) => {
      const { x, y, width, height } = control.getBoundingClientRect()
      return { x, y, width, height }
    }),
  )
}

test('the words of a write that runs move nothing and lie over no label', async ({
  page,
  address,
}) => {
  await page.goto(address + PART, { waitUntil: 'networkidle' })
  const group = page.getByRole('group', { name: 'Assignees' })
  const select = group.getByRole('combobox')
  const label = group.getByText('Responsible', { exact: true })
  await label.evaluate((node, text) => {
    node.textContent = text
  }, LONG_LABEL)
  const long = group.getByText(LONG_LABEL)
  const places = await readPlaces(group)

  await page.evaluate(() => Object.assign(globalThis, { holdAssign: true }))
  const other = await select.evaluate(
    (node: HTMLSelectElement) =>
      [...node.options].find(
        ({ value }) => value !== '' && value !== node.value,
      )?.value ?? '',
  )
  await select.selectOption(other)
  const saving = group.getByText('Saving').locator('..')
  await saving.waitFor()

  expect(await readPlaces(group)).toEqual(places)
  // Each line of the words of the label, and the box of the words "Saving".
  const lines = await long.evaluate((node) => {
    const range = document.createRange()
    range.selectNodeContents(node)
    return [...range.getClientRects()].map(({ left, right, top, bottom }) => ({
      left,
      right,
      top,
      bottom,
    }))
  })
  const box = await saving.boundingBox()
  const covered = lines.filter(
    ({ left, right, top, bottom }) =>
      box !== null &&
      left < box.x + box.width &&
      right > box.x &&
      top < box.y + box.height &&
      bottom > box.y,
  )
  expect(lines.length).toBeGreaterThan(0)
  expect(covered).toEqual([])
})
