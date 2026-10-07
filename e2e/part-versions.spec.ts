import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { test } from './app.ts'

// The Decision has two Versions.
const PART = 'glue/part-model/D4'

// The left and the right edge of the words of an entry in the activity
// list. The words of a button start after its border and its padding.
function readEdges(entry: Locator) {
  return entry.evaluate((item) =>
    [...item.children].map((child) => {
      const { left, right } = child.getBoundingClientRect()
      const { paddingInlineStart, borderInlineStartWidth } =
        getComputedStyle(child)
      const inset =
        child instanceof HTMLButtonElement
          ? parseFloat(paddingInlineStart) + parseFloat(borderInlineStartWidth)
          : 0
      return { left: left + inset, right }
    }),
  )
}

// The entry of the sign-off that stored Version 1.
async function openPart(page: Page, address: string) {
  await page.goto(address + PART, { waitUntil: 'networkidle' })
  const entry = page
    .getByRole('region', { name: 'Activity' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'Version 1' }) })
  return { entry, button: entry.getByRole('button', { name: 'Version 1' }) }
}

test('the gap before the button of a Version is the gap of its line', async ({
  page,
  address,
}) => {
  const { entry } = await openPart(page, address)

  const [day, state, member, button] = await readEdges(entry)

  expect(button.left - member.right).toBe(state.left - day.right)
})

test('the button of a Version on its own line starts below the day', async ({
  page,
  address,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  const { entry } = await openPart(page, address)

  const edges = await readEdges(entry)

  expect(edges.at(-1)?.left).toBe(edges.at(0)?.left)
})

test('the button of an open Version differs from a closed one with no focus', async ({
  page,
  address,
}) => {
  const { button } = await openPart(page, address)
  const closed = await button.screenshot()

  await button.click()
  await page.getByRole('region', { name: 'Version 1' }).waitFor()
  await button.blur()
  await page.mouse.move(0, 0)

  expect((await button.screenshot()).equals(closed)).toBe(false)
})
