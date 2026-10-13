import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const base = process.env.AUDIT_APP_URL || 'http://localhost:3010'
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/)
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)
const browser = await puppeteer.launch({ executablePath, headless: true })
let mode = 'missing'
const secret = 'Supabase private_customer_table SQL sensitive-test-marker'
let checks = 0
try {
  const page = await browser.newPage()
  const runtimeErrors = []
  page.on('pageerror', error => runtimeErrors.push(error.message))
  await page.setViewport({ width: 390, height: 844 })
  await page.setRequestInterception(true)
  page.on('request', request => {
    const url = request.url()
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' }
    if (url.includes('/rest/v1/') || url.includes('/auth/v1/')) {
      if (request.method() === 'OPTIONS') return request.respond({ status: 200, headers })
      const isFailure = (mode === 'unavailable' && url.includes('/get_public_cafe')) || url.includes('/auth/v1/token') || mode === 'pricing'
      return request.respond({ status: isFailure ? (mode === 'invalid-login' ? 400 : 500) : 200, headers, contentType: 'application/json', body: JSON.stringify(isFailure ? { code: mode === 'invalid-login' ? 'invalid_credentials' : '42P01', error_code: mode === 'invalid-login' ? 'invalid_credentials' : 'unexpected_failure', message: secret } : []) })
    }
    return request.continue()
  })
  const check = async (label, expected) => {
    await page.waitForFunction(text => document.body.innerText.includes(text), {}, expected).catch(async error => {
      console.log('Unexpected screen:', await page.evaluate(() => document.body.innerText))
      throw error
    })
    const text = await page.evaluate(() => document.body.innerText)
    assert.doesNotMatch(text, /Supabase|private_customer_table|SQL|sensitive-test-marker/)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    checks++; console.log('PASS ' + label)
  }
  await page.goto(base + '/missing-cafe/menu', { waitUntil: 'networkidle2' })
  await check('missing cafe has safe guidance on mobile', 'Check the link or ask the cafe for a new QR code.')
  assert.equal(await page.$eval('a.primary-button', a => a.getAttribute('href')), '/')
  mode = 'unavailable'
  await page.reload({ waitUntil: 'networkidle2' })
  await check('service error does not expose response details', 'Temporarily unavailable')
  mode = 'missing'
  await page.click('button.primary-button')
  await check('retry reloads the cafe lookup', 'Cafe Not Found')
  for (mode of ['login-error', 'invalid-login']) {
    await page.goto(base + '/login', { waitUntil: 'networkidle2' })
    await page.type('input[type=email]', 'failure@example.test')
    await page.type('input[type=password]', 'Synthetic-test-only!')
    await page.click('button[type=submit]')
    await check(mode, mode === 'invalid-login' ? 'The email or password is incorrect.' : 'We couldn’t sign you in.')
  }
  mode = 'pricing'
  await page.goto(base + '/pricing', { waitUntil: 'networkidle2' })
  await check('pricing does not expose failed catalog response', 'Plans are temporarily unavailable.')
  assert.deepEqual(runtimeErrors, [])
  console.log(`Verified ${checks} browser failure/recovery scenarios; no runtime exceptions.`)
} finally { await browser.close() }
