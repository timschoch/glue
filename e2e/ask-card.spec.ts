import { expect } from '@playwright/test'
import type { Locator } from '@playwright/test'

import { test } from './app.ts'

test.use({ viewport: { width: 1440, height: 900 } })

const surface = (part: Locator) =>
  part.evaluate((element) => getComputedStyle(element).backgroundColor)

test('the button "Start study" of an Ask is on the surface of its card', async ({
  page,
  address,
}) => {
  await page.goto(`${address}glue?section=Mine`, { waitUntil: 'networkidle' })

  const ask = page.getByRole('list', { name: 'Asks' }).getByRole('listitem')
  await ask.getByRole('button', { name: 'Start study' }).waitFor()

  expect(await surface(ask)).toBe(await surface(ask.getByRole('link')))
})
