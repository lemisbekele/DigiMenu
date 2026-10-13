import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const base = 'http://localhost:3010'
const out = 'artifacts/audit/superadmin-visuals'
fs.mkdirSync(out, { recursive: true })
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
let checks = 0
const check = (label, condition) => { assert.ok(condition, label); checks++; console.log('PASS ' + label) }
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && /ErrorBoundary|ReferenceError|TypeError/.test(message.text())) errors.push(message.text()) })
  await page.goto(base + '/login', { waitUntil: 'networkidle2' })
  await page.type('#login-email', process.env.AUDIT_EMAIL || 'superadmin@lemi.test')
  await page.type('#login-password', process.env.AUDIT_PASSWORD || 'Password1!')
  await page.click('button[type=submit]')
  await page.waitForFunction(() => location.pathname === '/superadmin/dashboard')
  await page.waitForSelector('.sa-month-chart')
  check('dashboard uses real request and cafe charts', await page.$$('.sa-chart').then(items => items.length === 2))
  check('navigation has six main destinations', await page.$$('.sa-nav-flat-list .sa-nav-link').then(items => items.length === 6))
  check('account security remains accessible', !!await page.$('a[aria-label="Account and security"]'))
  for (const [route, expected] of [['subscriptions', '/superadmin/requests?view=subscriptions'], ['cafe', '/superadmin/cafes']]) {
    await page.goto(base + '/superadmin/' + route, { waitUntil: 'networkidle2' })
    check(route + ' bookmark redirects', new URL(page.url()).pathname + new URL(page.url()).search === expected)
  }
  const routes = ['dashboard', 'requests', 'requests?view=subscriptions', 'cafes', 'packages', 'announcements', 'audit-logs', 'profile']
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => localStorage.setItem('cafe-theme', value), theme)
    for (const width of [360, 768, 1440]) {
      await page.setViewport({ width, height: 1000 })
      for (const route of routes) {
        await page.goto(base + '/superadmin/' + route, { waitUntil: 'networkidle2' })
        await page.waitForSelector('.sa-content h1, .sa-content h2')
        const label = `${route} ${theme} ${width}px`
        check(label + ' fits viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        check(label + ' has no load failure', !await page.$('.sa-feed-state[role=alert]'))
        if (width !== 768) await page.screenshot({ path: `${out}/${route.replace(/[^a-z-]/g, '_')}-${theme}-${width}.png`, fullPage: true })
      }
    }
  }
  await page.goto(base + '/superadmin/requests', { waitUntil: 'networkidle2' })
  await page.click('.sa-workspace-tabs a[href*="view=subscriptions"]')
  await page.waitForSelector('.sa-chart')
  check('workspace tabs switch to subscription history', page.url().includes('view=subscriptions'))
  await page.click('.sa-workspace-tabs a[href="/superadmin/requests"]')
  await page.waitForSelector('input[aria-label="Search pending requests"]')
  check('workspace tabs restore pending request actions', !page.url().includes('view='))
  await page.setRequestInterception(true)
  page.on('request', req => req.url().includes('/rest/v1/cafes') ? req.respond({ status: 500, contentType: 'application/json', body: '{"message":"Synthetic internal database failure"}' }) : req.continue())
  await page.goto(base + '/superadmin/dashboard', { waitUntil: 'networkidle2' })
  await page.waitForSelector('.sa-feed-state[role=alert]')
  check('failed feed never displays misleading zero charts', !await page.$('.sa-chart'))
  check('feed errors hide backend details', !(await page.$eval('.sa-content', el => el.textContent)).includes('Synthetic'))
  check('no runtime exceptions', errors.length === 0)
  console.log(`Verified ${checks} superadmin checks.`)
} finally { await browser.close() }
