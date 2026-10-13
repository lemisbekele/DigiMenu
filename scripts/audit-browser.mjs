import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const base=process.env.AUDIT_APP_URL || 'http://localhost:3010'
assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/)
const out=path.resolve('artifacts/audit',process.env.AUDIT_VARIANT || '')
fs.mkdirSync(out,{recursive:true})
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)
const browser=await puppeteer.launch({executablePath,headless:true,args:['--disable-gpu']})
const results=process.env.AUDIT_RESUME==='1' && fs.existsSync(path.join(out,'browser-results.json')) ? JSON.parse(fs.readFileSync(path.join(out,'browser-results.json'),'utf8')).filter(r=>r.ok) : []
const completed=new Set(results.map(r=>r.label))
const selectedRoles=process.env.AUDIT_ROLES?.split(',')
const roles={
 admin:['dashboard','orders','admin/menu','tables','users','inventory','audit-logs','settings'],
 manager:['dashboard','orders','admin/menu','tables','inventory','audit-logs'],
 cashier:['pos','orders','tables'],
 barista:['kds','history','inventory','kds/settings'],
 superadmin:['dashboard','requests','cafes','packages','subscriptions','audit-logs','announcements','profile'],
}
const sizes=(process.env.AUDIT_WIDTHS || '360,768,1440').split(',').map(Number).map(width=>({width,height:width===768?1024:900}))
async function configure(page) {
  await page.evaluateOnNewDocument(theme=>localStorage.setItem('cafe-theme',theme),process.env.AUDIT_THEME || 'dark')
}
let failed=false
async function inspect(page,label) {
  await page.waitForFunction(()=>document.body.innerText.length>40)
  await new Promise((r)=>setTimeout(r,500))
  const result=await page.evaluate(()=>({
    text:document.body.innerText.slice(0,500),
    overflow:document.documentElement.scrollWidth>innerWidth+1,
    wide:[...document.querySelectorAll('main,section,header,form,nav')].filter((e)=>e.getBoundingClientRect().right>innerWidth+2&&getComputedStyle(e).position!=='fixed').map((e)=>e.className).slice(0,6),
    font:getComputedStyle(document.body).fontFamily,
  }))
  const ok=!result.overflow&&!/Something went wrong|Service Unavailable|Not authorized|Account Problem|Cafe Not Found|Could not load|permission denied/i.test(result.text)
  results.push({label,url:page.url(),ok,...result})
  console.log(`${ok?'PASS':'FAIL'} ${label} ${JSON.stringify(result.wide)}`)
  if(!ok) failed=true
  await page.screenshot({path:path.join(out,label.replaceAll('/','-')+'.png'),fullPage:true})
}
try {
 const publicContext=await browser.createBrowserContext()
 const page=await publicContext.newPage()
 await configure(page)
 for(const size of process.env.AUDIT_SKIP_PUBLIC==='1'?[]:sizes) {
   await page.setViewport(size)
   for(const route of ['/','/pricing','/lemi-coffee/menu?table=1','/lemi-coffee/my-orders','/login','/reset-password','/not-a-cafe/menu']) {
     if(completed.has(`public-${size.width}-${route.replaceAll('?','-')||'home'}`)) continue
     await page.goto(base+route,{waitUntil:'networkidle2'})
     if(route.includes('not-a-cafe')) {
       const text=await page.evaluate(()=>document.body.innerText)
       assert.match(text,/Cafe Not Found/); continue
     }
     await inspect(page,`public-${size.width}-${route.replaceAll('?','-')||'home'}`)
   }
 }
 await publicContext.close()
 for(const [role,routes] of Object.entries(roles)) {
  if(selectedRoles && !selectedRoles.includes(role)) continue
  const context=await browser.createBrowserContext()
  const page=await context.newPage()
  await configure(page)
  const errors=[]
  page.on('pageerror',(error)=>errors.push(error.message))
  await page.goto(base+'/login',{waitUntil:'networkidle2'})
  await page.waitForSelector('input[type="email"]')
  await page.type('input[type="email"]',`${role}@lemi.test`)
  await page.type('input[type="password"]','Password1!')
  await page.click('button[type="submit"]')
  await page.waitForFunction(()=>!location.pathname.endsWith('login'),{timeout:15000}).catch(async()=>{
    throw new Error(`${role} login failed: ${await page.evaluate(()=>document.body.innerText)}`)
  })
  for(const size of sizes) {
   await page.setViewport(size)
   for(const route of routes) {
    if(completed.has(`${role}-${size.width}-${route}`)) continue
    const prefix=role==='superadmin'?'/superadmin/':'/lemi-coffee/'
    await page.goto(base+prefix+route,{waitUntil:'networkidle2'})
    await inspect(page,`${role}-${size.width}-${route}`)
   }
  }
  // Manually entered URLs must never switch a cafe or elevate a role.
  if(role!=='superadmin') {
    await page.goto(base+'/enterprise-cafe/users',{waitUntil:'networkidle2'})
    const text=await page.evaluate(()=>document.body.innerText)
    assert.ok(!text.includes('User Management'),'cross-cafe route exposed users')
    if(role!=='admin') {
      await page.goto(base+'/lemi-coffee/users',{waitUntil:'networkidle2'})
      assert.ok(!page.url().endsWith('/users'),'unauthorized users route accepted')
    }
  }
  assert.deepEqual(errors,[],`${role} runtime errors`)
  await context.close()
 }
} finally {
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(results,null,2))
 await browser.close()
}
if(failed) process.exitCode=1
console.log(`Inspected ${results.length} browser page/viewport combinations.`)
