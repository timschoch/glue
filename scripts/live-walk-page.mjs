// The steps of the live walk that wait for the page: scripts/live-walk.mjs.

// Saves a picture of the whole page. The window grows to the height of the
// page for the picture: Playwright's `fullPage` keeps the window, so a panel
// that stays in place while the page scrolls would end at the window height.
export async function saveScreenshot(page, path) {
  const window = page.viewportSize()
  const height = await page.evaluate(
    () => document.documentElement.scrollHeight,
  )
  await page.setViewportSize({
    width: window.width,
    height: Math.max(window.height, height),
  })
  await page.screenshot({ path })
  await page.setViewportSize(window)
}

// A record id at the end of the path of a link, before the search: a type
// letter and a number. The card of a Concept ends with a slug.
const RECORD_ID = /\/([A-Z]\d+)(?:\?|$)/

// Opens the record of the first card of a Part in the main window, and waits
// until the record is on the screen. False: no card of a Part.
export async function openFirstRecord(page) {
  const hrefs = await page
    .locator('main a[href]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
  const href = hrefs.find((candidate) => RECORD_ID.test(candidate))
  if (href === undefined) return false
  const [, recordId] = RECORD_ID.exec(href)
  await page.locator(`main a[href="${href}"]`).first().click()
  // The list is no article: only the record is one, and it shows its id.
  await page
    .getByRole('main')
    .getByRole('article')
    .filter({ hasText: recordId })
    .waitFor()
  return true
}
