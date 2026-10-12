import { mkdir } from 'node:fs/promises'

import { chromium } from '@playwright/test'
import { createServer } from 'vite'

// PROTOTYPE, throwaway (design-system/D16). Takes the nine pictures of the
// three variants, headless: `node e2e/prototype-screenshots.mjs`.

process.env.GLUE_PROTOTYPE = '1'

const folder = 'docs/screenshots/prototype'
const concepts = {
  full: 'signals-and-insights',
  gaps: 'own-tools',
  empty: 'onboarding',
}

const app = await createServer({
  configFile: 'e2e/vite.config.ts',
  server: { port: 3414 },
})
await app.listen()
const origin = app.resolvedUrls.local[0]
const browser = await chromium.launch()
const pageErrors = []

try {
  await mkdir(folder, { recursive: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  for (const variant of ['A', 'B', 'C']) {
    for (const [name, slug] of Object.entries(concepts)) {
      await page.goto(new URL(`glue/${slug}?variant=${variant}`, origin).href, {
        waitUntil: 'networkidle',
      })
      await page.locator('h1').waitFor()
      // The window gets the height of the page: the left panel and the bar
      // of the variants are fixed to the window.
      await page.setViewportSize({ width: 1440, height: 900 })
      const height = await page.evaluate(
        () => document.documentElement.scrollHeight,
      )
      await page.setViewportSize({ width: 1440, height })
      await page.screenshot({
        path: `${folder}/${variant.toLowerCase()}-${name}.png`,
        fullPage: true,
      })
    }
  }
} finally {
  await browser.close()
  await app.close()
}

if (pageErrors.length > 0) console.error(pageErrors.join('\n'))
// The dev server keeps handles open after it closes.
process.exit(pageErrors.length > 0 ? 1 : 0)
