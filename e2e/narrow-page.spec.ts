import { expect } from '@playwright/test'

import { test } from './app.ts'

const PHONE_WIDTH = 320

test.use({ viewport: { width: PHONE_WIDTH, height: 800 } })

// The Insight is in a flow of three steps.
const PART = 'glue/part-model/I3'

for (const [name, path] of [
  ['a Part', PART],
  ['a Concept', 'glue/part-model'],
]) {
  test(`${name} is as wide as a phone`, async ({ page, address }) => {
    await page.goto(address + path, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { level: 1 }).waitFor()

    const width = await page.evaluate(
      () => document.documentElement.scrollWidth,
    )

    expect(width).toBe(PHONE_WIDTH)
  })
}

test('the step bar of a Part cuts no word of a step on a phone', async ({
  page,
  address,
}) => {
  await page.goto(address + PART, { waitUntil: 'networkidle' })

  const bar = page.getByRole('list', { name: 'Evidence to Insight' })
  for (const step of ['Group', 'Check', 'Verify']) {
    const word = bar.getByText(step, { exact: true })
    const box = await word.boundingBox()
    const cut = await word.evaluate(
      (label) => label.scrollWidth > label.clientWidth,
    )

    expect(cut, step).toBe(false)
    expect((box?.x ?? 0) + (box?.width ?? 0), step).toBeLessThanOrEqual(
      PHONE_WIDTH,
    )
  }
})

test('the Responsible select of a Part stays in the frame on a phone', async ({
  page,
  address,
}) => {
  await page.goto(address + PART, { waitUntil: 'networkidle' })

  const box = await page
    .getByRole('combobox', { name: 'Responsible' })
    .boundingBox()

  expect(box?.x).toBeGreaterThanOrEqual(0)
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(PHONE_WIDTH)
})

test('each row of the loop steps starts with a step on a phone, not with a join line', async ({
  page,
  address,
}) => {
  await page.goto(address + 'glue/part-model', { waitUntil: 'networkidle' })

  const boxes = await page
    .getByRole('list', { name: 'Loop' })
    .getByRole('link')
    .evaluateAll((steps) =>
      steps.map((step) => {
        const { x, y } = step.getBoundingClientRect()
        return { x, y }
      }),
    )
  // The first step of each row: the step before it is on another row.
  const starts = boxes.filter((box, index) => box.y !== boxes[index - 1]?.y)

  expect(starts.length).toBeGreaterThan(1)
  expect(starts.map(({ x }) => x)).toEqual(starts.map(() => boxes[0].x))
})
