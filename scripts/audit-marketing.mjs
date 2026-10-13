import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const base=process.env.AUDIT_APP_URL || 'http://localhost:3010'
assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/)
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)
const browser=await puppeteer.launch({executablePath,headless:true})
const sql=query=>execFileSync('docker',['exec','-i','supabase_db_Cafe','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8'}).trim()
const email=`marketing-${crypto.randomBytes(6).toString('hex')}@example.test`
const errors=[]
let checks=0
const check=(label,condition)=>{assert.ok(condition,label);checks++;console.log('PASS '+label)}
fs.mkdirSync('artifacts/audit/marketing',{recursive:true})
try {
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.setViewport({width:390,height:844})
 await page.goto(base,{waitUntil:'networkidle2'})
 check('one page heading',await page.$$eval('h1',els=>els.length===1))
 check('no fake production/health/annual claims',!/Save 20%|All Systems Operational|Full-Stack|in production/.test(await page.evaluate(()=>document.body.innerText)))
 await page.click('.marketing-menu-button');check('mobile navigation expands',await page.$eval('.marketing-menu-button',e=>e.getAttribute('aria-expanded')==='true'))
 await page.click('.marketing-links a[href="/#product"]');await page.waitForFunction(()=>document.querySelector('.marketing-menu-button')?.getAttribute('aria-expanded')==='false');check('mobile navigation closes after selection',await page.$eval('.marketing-menu-button',e=>e.getAttribute('aria-expanded')==='false'))
 await page.click('.marketing-preview');await page.waitForSelector('dialog[open]');
 check('preview is a modal dialog',await page.$eval('dialog',d=>d.matches(':modal')))
 await page.keyboard.press('Escape');check('Escape closes preview',await page.$('dialog')===null)
 check('preview restores keyboard focus',await page.$eval('.marketing-preview',e=>e===document.activeElement))
 for(const lang of ['am','om','en']) { await page.click('.marketing-nav-actions .language-toggle');await page.waitForFunction(l=>document.documentElement.lang===l,{},lang);check(`${lang} page has no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)); }
 await page.goto(base+'/pricing',{waitUntil:'networkidle2'})
 const published=JSON.parse(sql("select json_agg(json_build_object('name',name,'price',price,'period',period)) from packages where status='active';"))
 const cards=await page.$$eval('.pricing-card',els=>els.map(e=>e.innerText))
 check('pricing matches every published package',published.every(p=>cards.some(c=>c.includes(p.name)&&c.includes(p.price)&&c.includes(p.period))))
 await page.click('.pricing-card button');await page.waitForSelector('dialog[open]')
 await page.type('input[name=name]','Marketing QA cafe');await page.type('input[name=email]',email);await page.type('input[name=contactName]','Marketing QA owner');await page.type('input[name=location]','Addis Ababa, Ethiopia')
 await page.setRequestInterception(true)
 page.on('request',req=>req.url().includes('/rest/v1/subscription_requests')&&req.method()==='POST'?req.abort():req.continue())
 await page.click('dialog button[type=submit]');await page.waitForSelector('dialog [role=alert]')
 check('failed submission shows no success',!(await page.$eval('dialog',d=>d.innerText)).includes('Request received'))
 await page.setRequestInterception(false);page.removeAllListeners('request')
 await page.click('dialog button[type=submit]');await page.waitForSelector('.request-success')
 check('success is backed by a pending database request',sql(`select count(*) from subscription_requests where email='${email}' and status='pending_approval';`)==='1')
 check('contact and location are persisted for review',sql(`select count(*) from subscription_requests where email='${email}' and notes like '%Contact person: Marketing QA owner%' and notes like '%Location: Addis Ababa, Ethiopia%';`)==='1')
 check('no invented activation or email-delivery promise',!(await page.$eval('dialog',d=>d.innerText)).includes('credentials will'))
 await page.keyboard.press('Escape')
 for(const theme of ['light','dark']) for(const width of [360,768,1440]) {
  await page.setViewport({width,height:900});await page.evaluate(v=>localStorage.setItem('cafe-theme',v),theme);await page.reload({waitUntil:'networkidle2'})
  check(`${theme} pricing fits ${width}px`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.screenshot({path:`artifacts/audit/marketing/pricing-${theme}-${width}.png`,fullPage:true})
 }
 check('no marketing runtime exceptions',errors.length===0)
 console.log(`Verified ${checks} marketing interactions and layouts.`)
} finally { sql(`delete from subscription_requests where email='${email}' and status='pending_approval';`);await browser.close() }
