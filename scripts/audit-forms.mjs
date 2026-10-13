import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const base = process.env.AUDIT_APP_URL || 'http://localhost:3010'
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/)
const out = 'artifacts/audit/forms'
fs.mkdirSync(out, { recursive: true })
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)
const browser = await puppeteer.launch({ executablePath, headless: true })
let checks = 0
const errors = []
const check = (label, value) => { assert.ok(value, label); checks++; console.log('PASS ' + label) }
async function clickText(page, text) {
  await page.waitForFunction(text => [...document.querySelectorAll('button')].some(b => b.textContent.includes(text) && !b.disabled), {}, text)
  await page.evaluate(text => [...document.querySelectorAll('button')].find(b => b.textContent.includes(text) && !b.disabled).click(), text)
}
async function login(role) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.evaluateOnNewDocument(() => localStorage.setItem('cafe-theme', 'light'))
  await page.goto(base + '/login', { waitUntil: 'networkidle2' })
  await page.type('input[type=email]', `${role}@lemi.test`)
  await page.type('input[type=password]', 'Password1!')
  await page.click('button[type=submit]')
  await page.waitForFunction(() => !location.pathname.endsWith('login'))
  await page.waitForNetworkIdle({idleTime:500})
  await page.goto(base + (role === 'superadmin' ? '/superadmin/dashboard' : '/lemi-coffee/' + (role === 'barista' ? 'history' : role === 'cashier' ? 'tables' : 'dashboard')), {waitUntil:'networkidle2'})
  return { context, page }
}
async function layouts(page, label, selector) {
  await page.waitForSelector(selector)
  for (const theme of ['light', 'dark']) for (const width of [360, 768, 1440]) {
    await page.setViewport({ width, height: 900 })
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme }, theme)
    await new Promise(resolve => setTimeout(resolve, 300))
    const result = await page.evaluate(selector => {
      const forms = [...document.querySelectorAll(selector)]
      const controls = forms.flatMap(f => [...f.querySelectorAll('input:not([type=hidden]),select,textarea')]).filter(e => e.getClientRects().length)
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        wide: controls.filter(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 }).map(e => e.placeholder || e.type),
        unlabeled: controls.filter(e => !e.labels?.length && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')).map(e => e.placeholder || e.type),
      }
    }, selector)
    check(`${label} ${theme} ${width}px fits and labels controls ${JSON.stringify(result)}`, !result.overflow && !result.wide.length && !result.unlabeled.length)
    if (width !== 768) await page.screenshot({ path: `${out}/${label}-${theme}-${width}.png`, fullPage: true })
  }
}
try {
  for (const role of ['admin', 'manager', 'cashier', 'barista']) {
    const { context, page } = await login(role)
    await page.waitForSelector('.notif-corner .notify-bell')
    for (const theme of ['light', 'dark']) for (const width of [360, 768, 1440]) {
      await page.setViewport({ width, height: 900 })
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme }, theme)
    await new Promise(resolve => setTimeout(resolve, 300))
      await page.waitForSelector(".notif-corner .notify-bell")
      const clean = await page.evaluate(() => {
        const boxes = [...document.querySelectorAll('.notif-corner .language-toggle,.notif-corner .theme-toggle,.notif-corner .notify-bell')].map(e => e.getBoundingClientRect())
        return boxes.length === 3 && boxes.every((a, i) => a.left >= 0 && a.right <= innerWidth && boxes.every((b, j) => i === j || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top))
      })
      if (!clean) { console.log(await page.$$eval(".notif-corner button", es => es.map(e => ({className:e.className,rect:e.getBoundingClientRect().toJSON(),position:getComputedStyle(e).position})))); await page.screenshot({path:out+"/toolbar-failure.png"}) }
      check(`${role} toolbar ${theme} ${width}px does not overlap`, clean)
      await page.click('.notify-bell')
      check(`${role} notification panel fits ${width}px`, await page.$eval('.notification-dropdown', e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth }))
      await page.keyboard.press('Escape')
      check(`${role} Escape restores notification focus`, await page.$eval('.notify-bell', e => e === document.activeElement && e.getAttribute('aria-expanded') === 'false'))
    }
    if (role === 'admin') {
      for (const [route, label, button, selector] of [
        ['users', 'staff', 'Add User', 'form.admin-form'],
        ['inventory', 'inventory', 'Add inventory item', '.inventory-form'],
        ['admin/menu', 'menu', 'Add item', '.menu-item-editor'],
        ['tables', 'tables', null, '.admin-add-table-form,.qr-copy-form'],
        ['settings', 'settings', null, 'form'],
      ]) {
        await page.goto(base + '/lemi-coffee/' + route, { waitUntil: 'networkidle2' })
        if (button) await clickText(page, button)
        await layouts(page, label, selector)
        if (label === 'staff') check('staff name, email and temporary password required', await page.$eval('form.admin-form', f => !f.checkValidity() && f.querySelector('input[autocomplete=name]').required))
        if (label === 'settings') {
          const type = await page.$('#payment-form input[list=payment-types]')
          await type.click({ clickCount: 3 }); await type.type('Cash')
          check('cash does not require transfer account details', await page.$$eval('#payment-form input', es => es.filter(e => e.maxLength === 80 || e.maxLength === 120).filter(e => !e.list && !e.placeholder).every(e => !e.required)))
        }
      }
    }
    await context.close()
  }
  const { context, page } = await login('superadmin')
  for (const [route, label, button, selector] of [
    ['packages', 'package-create', 'New Package', 'form.sa-modal'],
    ['packages', 'package-edit', 'Edit Package', 'form.sa-modal'],
    ['packages', 'package-assign', 'Assign Cafe', 'form.sa-modal'],
    ['cafes', 'owner-email', 'Owner', 'form.sa-modal'],
    ['cafes', 'cafe-package', 'Package', 'form.sa-modal'],
    ['announcements', 'announcement', 'New Announcement', 'form.sa-modal'],
    ['profile', 'profile', null, 'form'],
  ]) {
    await page.goto(base + '/superadmin/' + route, { waitUntil: 'networkidle2' })
    if (button) await clickText(page, button)
    await layouts(page, label, selector)
    if (label === 'package-create') check('empty package cannot submit', await page.$eval('form.sa-modal', f => !f.checkValidity()))
  }
  await context.close()
  check('no browser runtime exceptions', errors.length === 0)
  console.log(`Verified ${checks} form and toolbar assertions; no operational data was submitted.`)
} finally { await browser.close() }
