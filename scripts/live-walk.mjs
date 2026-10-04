// Signs in on the live app with the Orchestrator's test account and walks the screens.
// Usage: node scripts/live-walk.mjs [base URL] [extra paths]. Prints no secret.
// The account is in .temp/test-account.json, the screenshots go to .temp/live/.
import { chromium } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const base = process.argv[2] ?? 'https://glue-glue-glue.vercel.app'
const accountFile = new URL('../.temp/test-account.json', import.meta.url)
const out = new URL('../.temp/live/', import.meta.url)
mkdirSync(out, { recursive: true })

let account
let isNew = false
if (existsSync(accountFile)) {
  account = JSON.parse(readFileSync(accountFile, 'utf8'))
  isNew = !account.created
} else {
  account = {
    name: 'Orchestrator',
    email: `orchestrator+live-${randomBytes(3).toString('hex')}@example.com`,
    password: randomBytes(18).toString('base64url'),
  }
  writeFileSync(accountFile, JSON.stringify(account), { mode: 0o600 })
  isNew = true
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const problems = []
let where = 'start'
page.on('console', (message) => {
  if (message.type() === 'error')
    problems.push(`${where}: console: ${message.text().slice(0, 200)}`)
})
page.on('pageerror', (error) =>
  problems.push(`${where}: page error: ${error.message.slice(0, 200)}`),
)
page.on('response', (response) => {
  if (response.status() >= 500)
    problems.push(
      `${where}: ${response.status()} ${response.url().slice(0, 120)}`,
    )
})

async function shot(name) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.screenshot({
    path: new URL(`${name}.png`, out).pathname,
    fullPage: true,
  })
  const text = (
    await page
      .locator('main')
      .first()
      .innerText()
      .catch(() => '')
  ).replace(/\s+/g, ' ')
  console.log(
    `${name} | ${page.url().replace(base, '')} | ${text.slice(0, 160)}`,
  )
}

where = isNew ? 'sign-up' : 'sign-in'
await page.goto(`${base}/${where}?redirect=%2Fglue`)
await page.waitForLoadState('networkidle').catch(() => {})
await page.waitForTimeout(1500)
if (isNew) await page.getByLabel('Name').fill(account.name)
await page
  .getByLabel('E-mail')
  .or(page.getByLabel('Email'))
  .first()
  .fill(account.email)
await page.getByLabel('Password').first().fill(account.password)
await page.locator('button[type=submit]').click()
await page
  .waitForURL((url) => !/sign-(in|up)/.test(url.pathname), { timeout: 30000 })
  .catch(() => {
    problems.push(`${where}: still on ${page.url().replace(base, '')}`)
  })
if (isNew && !/sign-(in|up)/.test(new URL(page.url()).pathname))
  writeFileSync(accountFile, JSON.stringify({ ...account, created: true }), {
    mode: 0o600,
  })
await shot('01-after-sign-in')

where = 'project'
await page.goto(`${base}/glue`)
await shot('02-project')

const links = await page
  .locator('aside a, nav a')
  .evaluateAll((anchors) => [
    ...new Set(
      anchors
        .map((anchor) => anchor.getAttribute('href'))
        .filter((href) => href?.startsWith('/')),
    ),
  ])
let shotNumber = 3
for (const href of links.slice(0, 14)) {
  where = href
  await page.goto(`${base}${href}`)
  await shot(
    `${String(shotNumber++).padStart(2, '0')}-${href.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`,
  )
}

for (const path of process.argv.slice(3)) {
  where = path
  await page.goto(`${base}${path}`)
  await page.waitForTimeout(2500)
  await shot(
    `${String(shotNumber++).padStart(2, '0')}-${path.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`,
  )
}

where = 'record'
await page.goto(`${base}/glue`)
await page.waitForLoadState('networkidle').catch(() => {})
const card = page.locator('main a[href*="/glue/"]').first()
if (await card.count()) {
  await card.click()
  await shot(`${shotNumber++}-record`)
} else problems.push('record: no card link on the Project page')

console.log(`problems: ${problems.length}`)
for (const problem of [...new Set(problems)].slice(0, 40))
  console.log(`- ${problem}`)
await browser.close()
