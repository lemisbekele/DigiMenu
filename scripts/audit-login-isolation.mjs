// Uses the local seeded accounts in isolated browser storage. No passwords or
// tokens are written to artifacts. Does not run against a hosted environment.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const base = process.env.AUDIT_APP_URL || 'http://localhost:3010'
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/)
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)
const browser = await puppeteer.launch({ executablePath, headless: true, protocolTimeout: 30000 })
let checks = 0
const check = (label, condition) => { assert.ok(condition, label); checks++; console.log('PASS ' + label) }
const untilText = (page, text) => page.waitForFunction(value => document.body.innerText.includes(value), {}, text)
async function submit(page, email, password = 'Password1!') {
  await page.waitForSelector('input[type=email]')
  await page.type('input[type=email]', email)
  await page.type('input[type=password]', password)
  await page.click('button[type=submit]')
}
async function identity(page) {
  return page.evaluate(async () => {
    const { supabase } = await import('/src/services/supabase.js')
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) return null
    const profile = await supabase.from('user_roles').select('id,role,cafe_slug').eq('id', data.user.id).single()
    return { email: data.user.email, matching: profile.data?.id === data.user.id, role: profile.data?.role, cafe: profile.data?.cafe_slug }
  })
}
try {
  for (const [role, path] of process.env.AUDIT_TWO_TABS_ONLY === '1' ? [] : [['admin', 'dashboard'], ['manager', 'dashboard'], ['cashier', 'pos'], ['barista', 'kds'], ['superadmin', 'superadmin/dashboard']]) {
    const context = await browser.createBrowserContext()
    try {
      const page = await context.newPage()
      await page.goto(base + (role === 'superadmin' ? '/login' : '/lemi-coffee/login'), { waitUntil: 'networkidle2' })
      await submit(page, `${role}@lemi.test`)
      const expected = role === 'superadmin' ? '/' + path : '/lemi-coffee/' + path
      await page.waitForFunction(value => location.pathname === value, {}, expected)
      const actual = await identity(page)
      check(`${role} credentials authenticate exactly their own identity and role`, actual?.matching && actual.email === `${role}@lemi.test` && actual.role === role && (role === 'superadmin' ? !actual.cafe : actual.cafe === 'lemi-coffee'))
      await page.reload({ waitUntil: 'networkidle2' })
      check(`${role} reload preserves their identity`, (await identity(page))?.email === `${role}@lemi.test`)
    } finally { await context.close() }
  }

  const context = await browser.createBrowserContext()
  try {
    const page = await context.newPage()
    await page.goto(base + '/lemi-coffee/login', { waitUntil: 'networkidle2' })
    await submit(page, 'admin@lemi.test')
    await page.waitForSelector('.role-admin')
    console.log('Two-tab check: cafe admin signed in')
    const second = await context.newPage()
    await second.setViewport({ width: 390, height: 844 })
    await second.goto(base + '/lemi-coffee/login', { waitUntil: 'networkidle2' })
    await untilText(second, 'Current account:')
    check('a second login tab identifies the existing account without silently redirecting', new URL(second.url()).pathname === '/lemi-coffee/login' && (await second.$eval('[aria-label="Current account"]', el => el.textContent)).includes('admin@lemi.test'))
    check('current-account choices fit mobile', await second.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await second.click('[aria-label="Current account"] button')
    await second.waitForSelector('input[type=email]')
    await page.waitForSelector('input[type=email]')
    check('signing out to switch accounts clears both tabs', await identity(page) === null && await identity(second) === null)

    await submit(second, 'superadmin@lemi.test', 'Deliberately-wrong-password!')
    await untilText(second, 'The email or password is incorrect.')
    check('invalid credentials cannot fall back to the old cafe account', await identity(second) === null)
    await second.reload({ waitUntil: 'networkidle2' })
    await submit(second, 'superadmin@lemi.test')
    await untilText(second, 'Use the platform sign-in page for your superadmin account.')
    check('superadmin cafe login remains rejected on the same URL', new URL(second.url()).pathname === '/lemi-coffee/login' && await identity(second) === null)
    check('wrong-portal rejection does not open a cafe dashboard', await second.$('.role-admin') === null)
    await second.click('a[href="/login"]')
    await submit(second, 'superadmin@lemi.test')
    await untilText(second, 'Platform Overview')
    check('platform sign-in authenticates the superadmin identity', (await identity(second))?.role === 'superadmin')
    await untilText(page, 'Current account:')
    check('other login tab shows the new shared identity explicitly', (await page.$eval('[aria-label="Current account"]', el => el.textContent)).includes('superadmin@lemi.test') && await page.$('.role-admin') === null)
    await second.goto(base + '/lemi-coffee/dashboard', { waitUntil: 'networkidle2' })
    await untilText(second, 'Platform Overview')
    check('superadmin cannot enter a cafe dashboard by URL', new URL(second.url()).pathname === '/superadmin/dashboard' && await second.$('.role-admin') === null)
  } finally { await context.close() }
  console.log(`Verified ${checks} real-browser identity, session and login isolation checks.`)
} finally { await browser.close() }
