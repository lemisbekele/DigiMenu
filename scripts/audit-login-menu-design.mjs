import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const base = 'http://localhost:3010'
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)
const browser = await puppeteer.launch({ executablePath, headless: true, protocolTimeout: 30000 })
const out = 'artifacts/audit/login-menu-design'
fs.mkdirSync(out, { recursive: true })
let checks = 0
const check = (name, condition) => { assert.ok(condition, name); checks++; console.log('PASS ' + name) }
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  // Render the source vector into installable application icons.
  for (const [size, file] of [[180, 'apple-touch-icon'], [192, 'digimenu-192'], [512, 'digimenu-512']]) {
    await page.setViewport({ width: size, height: size })
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:white}svg{display:block;width:100%;height:100%}</style>${fs.readFileSync('public/digimenu-mark.svg', 'utf8')}`)
    await page.screenshot({ path: `public/${file}.png` })
  }
  for (const theme of ['light', 'dark']) for (const width of [360, 768, 1440]) {
    await page.setViewport({ width, height: 900 })
    await page.goto(base + '/login', { waitUntil: 'networkidle2' })
    await page.evaluate(value => localStorage.setItem('cafe-theme', value), theme)
    await page.reload({ waitUntil: 'networkidle2' })
    await page.waitForSelector('.login-form')
    check(`login ${theme} ${width}px fits`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    check(`login ${theme} ${width}px uses DigiMenu logo`, await page.$('.digimenu-brand-mark[src="/digimenu-mark.svg"]') !== null)
    await page.screenshot({ path: `${out}/login-${theme}-${width}.png`, fullPage: true })
  }
  await page.click('button[aria-label="Show password"]')
  check('password visibility control works', await page.$eval('#login-password', e => e.type === 'text'))
  await page.click('button[aria-label="Hide password"]')
  check('password can be hidden again', await page.$eval('#login-password', e => e.type === 'password'))
  await page.type('#login-email', 'manager@lemi.test')
  await page.type('#login-password', 'Password1!')
  await page.click('button[type=submit]')
  await page.waitForFunction(() => location.pathname === '/lemi-coffee/dashboard')
  await page.goto(base + '/lemi-coffee/admin/menu', { waitUntil: 'networkidle2' })
  for (const theme of ['light', 'dark']) for (const width of [360, 768, 1440]) {
    await page.setViewport({ width, height: 900 })
    await page.evaluate(value => localStorage.setItem('cafe-theme', value), theme)
    await page.reload({ waitUntil: 'networkidle2' })
    await page.waitForSelector('.admin-head .primary-button')
    await page.click('.admin-head .primary-button')
    await page.waitForSelector('dialog[open]')
    check(`editor ${theme} ${width}px is a native modal`, await page.$eval('dialog', e => e.matches(':modal')))
    check(`editor ${theme} ${width}px fits viewport`, await page.$eval('dialog', e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && e.scrollWidth <= e.clientWidth + 1 }))
    check(`editor ${theme} ${width}px keeps actions visible`, await page.$eval('.menu-item-editor-actions', e => { const r = e.getBoundingClientRect(); return r.bottom <= innerHeight && r.top > 0 }))
    await page.screenshot({ path: `${out}/editor-${theme}-${width}.png`, fullPage: true })
    await page.keyboard.press('Escape')
    check(`editor ${theme} ${width}px closes and restores focus`, await page.$('dialog') === null && await page.$eval('.admin-head .primary-button', e => e === document.activeElement))
  }
  await page.click('.admin-head .primary-button')
  await page.waitForSelector('dialog[open]')
  await page.type('input[placeholder="e.g. Caesar Salad"]', 'Design verification item')
  await page.type('textarea[placeholder="Briefly describe flavour, ingredients, or serving style"]', 'Preview form only')
  await page.type('.menu-item-editor-money-input input', '12.50')
  await page.type('input[placeholder="e.g. 250"]', '80')
  await page.type('input[placeholder="e.g. Main Course"]', 'Coffee')
  await page.click('.menu-locale-details summary')
  check('optional translation fields expand', await page.$eval('.menu-locale-details', e => e.open))
  await page.setRequestInterception(true)
  let writes = 0
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/rest/v1/menu_items')) { writes++; return request.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic backend failure' }) }) }
    return request.continue()
  })
  await page.click('dialog button[type=submit]')
  await page.waitForSelector('dialog [role=alert]')
  check('failed save stays in the editor with entered data', writes === 1 && await page.$eval('input[placeholder="e.g. Caesar Salad"]', e => e.value === 'Design verification item'))
  check('save failure shows safe copy', !(await page.$eval('dialog [role=alert]', e => e.textContent)).includes('Synthetic backend'))
  check('no runtime exceptions', errors.length === 0)
  console.log(`Verified ${checks} login/editor design and interaction checks.`)
} finally { await browser.close() }
