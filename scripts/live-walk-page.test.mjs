import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium } from '@playwright/test'
import {
  listWalkLinks,
  openFirstRecord,
  saveScreenshot,
} from './live-walk-page.mjs'

const WINDOW = { width: 1440, height: 900 }
const PAGE_HEIGHT = 3000
const WHITE = [255, 255, 255]

// A page three windows long, with a white left panel that stays in place
// while the page scrolls, like the left panel of Glue.
const LONG_PAGE = `
  <body style="margin: 0; background: rgb(200, 200, 200)">
    <nav style="position: fixed; inset-block: 0; inline-size: 256px; background: white"></nav>
    <main style="block-size: ${PAGE_HEIGHT}px"></main>
  </body>`

// The Project page with the card of a Concept and the card of a Part. A
// click on the card of the Part changes the address at once, and the record
// comes a moment later, like a route that loads.
const PROJECT_PAGE = `
  <main>
    <a href="/glue/part-model?section=Understand">Part model</a>
    <a id="part" href="/glue/glue/I1?section=Understand">Insight I1 Agents read files</a>
  </main>
  <script>
    document.querySelector('#part').addEventListener('click', (event) => {
      event.preventDefault()
      history.pushState(null, '', '#/glue/glue/I1')
      setTimeout(() => {
        document.querySelector('main').innerHTML =
          '<article><span>Insight</span> <span>I1</span><h1>Agents read files</h1></article>'
      }, 300)
    })
  </script>`

let browser
let page
const folder = mkdtempSync(join(tmpdir(), 'live-walk-'))

before(async () => {
  browser = await chromium.launch()
  page = await browser.newPage({ viewport: WINDOW })
})

after(async () => {
  await browser.close()
  rmSync(folder, { recursive: true })
})

// The size of a saved picture, and the colour of one of its points.
async function readPicture(path, point) {
  const reader = await browser.newPage()
  const read = await reader.evaluate(
    async ({ source, x, y }) => {
      const image = new Image()
      image.src = source
      await image.decode()
      const canvas = new OffscreenCanvas(image.width, image.height)
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      const [red, green, blue] = context.getImageData(x, y, 1, 1).data
      return {
        width: image.width,
        height: image.height,
        colour: [red, green, blue],
      }
    },
    {
      source: `data:image/png;base64,${readFileSync(path).toString('base64')}`,
      ...point,
    },
  )
  await reader.close()
  return read
}

test('the picture of a long page shows the left panel down to the end of the page', async () => {
  await page.setContent(LONG_PAGE)
  const path = join(folder, 'long.png')

  await saveScreenshot(page, path)

  const picture = await readPicture(path, { x: 10, y: PAGE_HEIGHT - 10 })
  assert.equal(picture.width, WINDOW.width)
  assert.equal(picture.height, PAGE_HEIGHT)
  assert.deepEqual(picture.colour, WHITE)
  assert.deepEqual(page.viewportSize(), WINDOW)
})

test('the record is on the screen when the first card of a Part is open', async () => {
  await page.setContent(PROJECT_PAGE)

  const opened = await openFirstRecord(page)

  assert.equal(opened, true)
  // What the page shows at this moment: a locator would wait for the record.
  assert.equal(
    await page.evaluate(() => document.querySelector('main').innerText),
    'Insight I1\nAgents read files',
  )
})

test('a page with no card of a Part opens no record', async () => {
  await page.setContent(
    '<main><a href="/glue/part-model">Part model</a></main>',
  )

  assert.equal(await openFirstRecord(page), false)
})

// The frame of a Project with more Concepts than the walk opens: the panel
// with the Concepts comes first in the page, the sections come after it.
const MANY_CONCEPTS = 30
const FRAME_PAGE = `
  <aside>
    <nav aria-label="Main">
      <a href="/glue">Concept</a>
      ${Array.from({ length: MANY_CONCEPTS }, (_, at) => `<a href="/glue/concept-${at}">Concept ${at}</a>`).join('')}
      <a href="https://example.com/docs">Docs</a>
    </nav>
  </aside>
  <nav aria-label="Sections">
    <a href="/glue?section=Mine">Mine</a>
    <ol>
      <li><a href="/glue?section=Understand">Understand</a></li>
      <li><a href="/glue?section=Decide">Decide</a></li>
      <li><a href="/glue?section=Design">Design</a></li>
      <li><a href="/glue?section=Build">Build</a></li>
      <li><a href="/glue">Use</a></li>
    </ol>
    <a href="/glue?section=People">People</a>
  </nav>`

test('the walk opens Mine, each loop step and People in a Project with many Concepts', async () => {
  await page.setContent(FRAME_PAGE)

  const links = await listWalkLinks(page, 3)

  assert.deepEqual(links, [
    '/glue?section=Mine',
    '/glue?section=Understand',
    '/glue?section=Decide',
    '/glue?section=Design',
    '/glue?section=Build',
    '/glue',
    '/glue?section=People',
    '/glue/concept-0',
    '/glue/concept-1',
    '/glue/concept-2',
  ])
})
