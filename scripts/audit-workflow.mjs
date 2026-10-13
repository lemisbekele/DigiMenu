import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'

export async function auditWorkflow({ cafe, clients, password, check }) {
  const base=process.env.AUDIT_APP_URL || 'http://localhost:3010'
  assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/)
  const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)
  const browser=await puppeteer.launch({ executablePath,headless:true })
  const errors=[]
  const pages=[]
  async function newPage() {
    const context=await browser.createBrowserContext(); const page=await context.newPage()
    pages.push(page); page.on('pageerror',e=>errors.push(e.message))
    page.on('dialog',d=>d.accept())
    await page.setViewport({width:390,height:844})
    return page
  }
  async function clickText(page,text) {
    await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes(t)&&!b.disabled),{},text)
    await page.evaluate(t=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(t)&&!b.disabled).click(),text)
  }
  async function login(role,path) {
    const page=await newPage()
    await page.goto(base+'/login',{waitUntil:'networkidle2'})
    await page.type('input[type=email]',clients[role].email)
    await page.type('input[type=password]',password)
    await page.click('button[type=submit]')
    await page.waitForFunction(()=>!location.pathname.endsWith('/login'))
    await page.goto(base+`/${cafe}/${path}`,{waitUntil:'networkidle2'})
    return page
  }
  try {
    const customer=await newPage()
    await customer.goto(base+`/${cafe}/menu?table=1`,{waitUntil:'networkidle2'})
    await customer.waitForSelector('.menu-card')
    if(process.env.AUDIT_MARKETING_SCREENSHOTS==='1') await customer.screenshot({path:'public/assets/screenshots/customer_menu_mobile.png'})
    await customer.click('.menu-card')
    await customer.click('input[name="Size-Large"]')
    await customer.type('.modal-card textarea','No foam please')
    await customer.click('.modal-content > button.primary-button')
    await customer.click('.floating-cart')
    await customer.click('.cart-drawer a[href*="checkout"]')
    await customer.waitForSelector('.place-order-btn')
    await customer.reload({waitUntil:'networkidle2'})
    check('browser cart persists through reload',(await customer.$('.place-order-btn'))!==null)
    await customer.click('.place-order-btn')
    await customer.waitForSelector('.order-confirmation-panel',{timeout:15000})
    const text=await customer.$eval('.order-confirmation-panel',el=>el.innerText)
    check('browser checkout confirms server-priced extras',text.includes('143.75'),text)
    await customer.click('.confirmation-actions a[href*="/order/"]')
    await customer.waitForFunction(()=>location.pathname.includes('/order/'))
    const orderId=new URL(customer.url()).pathname.split('/').pop()
    check('browser order tracking loads',!((await customer.evaluate(()=>document.body.innerText)).includes('access denied')))
    const kitchen=await login('barista','kds')
    await clickText(kitchen,'Accept & Auto-Start')
    await kitchen.waitForFunction(()=>document.body.innerText.includes('Mark as Ready'),{timeout:15000})
    check('browser kitchen hides money',!(await kitchen.evaluate(()=>document.body.innerText)).includes('ETB'))
    if(process.env.AUDIT_MARKETING_SCREENSHOTS==='1') { await kitchen.setViewport({width:1440,height:900}); await kitchen.screenshot({path:'public/assets/screenshots/kitchen_kds.png'}) }
    await clickText(kitchen,'Mark as Ready')
    const cashier=await login('cashier','pos')
    if(process.env.AUDIT_MARKETING_SCREENSHOTS==='1') { await cashier.setViewport({width:1440,height:900}); await cashier.screenshot({path:'public/assets/screenshots/cashier_pos.png'}) }
    await clickText(cashier,'Approve Payment')
    await customer.waitForFunction(()=>/Payment Confirmed|Payment confirmed|Paid/.test(document.body.innerText),{timeout:20000})
    check('browser customer sees confirmed payment',true)
    const manager=await login('manager','audit-logs')
    await manager.waitForFunction(()=>document.body.innerText.includes('143.75'),{timeout:15000})
    check('browser report includes cashier settlement',true)
    const owner=await login('admin','inventory')
    check('browser owner inventory opens',(await owner.evaluate(()=>document.body.innerText)).includes('Inventory'))
    if(process.env.AUDIT_MARKETING_SCREENSHOTS==='1') { await owner.setViewport({width:1440,height:900}); await owner.goto(base+`/${cafe}/dashboard`,{waitUntil:'networkidle2'}); await owner.screenshot({path:'public/assets/screenshots/operations_dashboard.png'}) }
    check('browser workflow has no runtime exceptions',errors.length===0,errors)
    fs.mkdirSync('artifacts/audit',{recursive:true})
    await customer.screenshot({path:'artifacts/audit/workflow-customer-paid.png',fullPage:true})
    await kitchen.screenshot({path:'artifacts/audit/workflow-kitchen.png',fullPage:true})
    await manager.screenshot({path:'artifacts/audit/workflow-report.png',fullPage:true})
    return orderId
  } catch (error) {
    fs.mkdirSync('artifacts/audit',{recursive:true})
    for(let i=0;i<pages.length;i++) await pages[i].screenshot({path:`artifacts/audit/workflow-failure-${i}.png`,fullPage:true}).catch(()=>{})
    throw error
  } finally { await browser.close() }
}
