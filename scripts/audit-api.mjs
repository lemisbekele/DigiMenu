// Real local Auth/PostgREST/Storage regression tests. Never runs against a hosted project.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { auditWorkflow } from './audit-workflow.mjs'

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((s) => /^\w+=/.test(s)).map((s) => { const i=s.indexOf('='); return [s.slice(0,i),s.slice(i+1).replace(/^['"]|['"]$/g,'')] }))
const base = env.VITE_SUPABASE_URL
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):54321$/)
const key = env.VITE_SUPABASE_ANON_KEY
const sql = (query) => execFileSync('docker',['exec','-i','supabase_db_Cafe','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{ input:query, encoding:'utf8' }).trim()
const q = (value) => `'${String(value).replaceAll("'","''")}'`
const prefix = `audit-${crypto.randomBytes(5).toString('hex')}`
const password = crypto.randomBytes(24).toString('base64url')+'Aa1!'
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url')
const now = Math.floor(Date.now()/1000)
const unsigned = `${enc({alg:'HS256',typ:'JWT'})}.${enc({role:'service_role',iss:'supabase',iat:now,exp:now+3600})}`
const service = `${unsigned}.${crypto.createHmac('sha256','super-secret-jwt-token-with-at-least-32-characters-long').update(unsigned).digest('base64url')}`
const users = []
let checks = 0
function check(name, condition, detail) { assert.ok(condition, `${name}: ${JSON.stringify(detail)}`); checks++; console.log(`PASS ${name}`) }
async function request(path, {token,method='GET',body,headers={}}={}) {
  const response=await fetch(base+path,{method,headers:{apikey:key,...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json',Prefer:'return=representation',...headers},body:body===undefined?undefined:JSON.stringify(body)})
  const text=await response.text(); let data; try { data=JSON.parse(text) } catch { data=text }
  return {status:response.status,data}
}
const rpc=(name,body,token)=>request(`/rest/v1/rpc/${name}`,{method:'POST',body,token})
const deny=(name,r)=>check(name,r.status>=400 || (Array.isArray(r.data)&&r.data.length===0),r)
const clients={}
const cafes=[`${prefix}-a`,`${prefix}-b`]
let orderId, menuId, otherMenu, customerToken=crypto.randomBytes(32).toString('hex')
const storageObjects = []
const requests = []
const testPackage = `${prefix}-package`
async function upload(bucket, path, token, capability) {
  const r = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers: { apikey:key, Authorization:`Bearer ${token || key}`, 'Content-Type':'image/png', ...(capability ? {'x-order-token':capability} : {}) }, body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64') })
  const data = await r.json(); if (r.ok) storageObjects.push({ bucket, path })
  return { status:r.status, data }
}
try {
  for(const cafe of cafes) sql(`insert into cafes(id,slug,name,status) values(${q(cafe)},${q(cafe)},${q(cafe)},'active');
    insert into subscription_requests(id,cafe_id,cafe_slug,plan_key,status,customer_name,email,activated_at) values(${q(cafe)},${q(cafe)},${q(cafe)},'enterprise','active','Audit','audit@example.test',now());
    insert into tables(id,cafe_slug,table_number) values(${q(cafe)},${q(cafe)},1);
    insert into settings(id,cafe_slug,tax_label,tax_rate) values(${q('billing_'+cafe)},${q(cafe)},'VAT',15);`)
  for (const [role,cafe] of [['admin',cafes[0]],['manager',cafes[0]],['cashier',cafes[0]],['barista',cafes[0]],['superadmin',null],['adminB',cafes[1]]]) {
    const email=`${prefix}-${role}@example.test`
    const result=await request('/auth/v1/admin/users',{method:'POST',token:service,body:{email,password,email_confirm:true}})
    check(`create ${role} auth fixture`,result.status===200,result)
    const id=result.data.id; users.push(id)
    sql(`insert into user_roles(id,email,role,cafe_id,cafe_slug,disabled) values(${q(id)},${q(email)},${q(role==='adminB'?'admin':role)},${cafe?q(cafe):'null'},${cafe?q(cafe):'null'},false);`)
    const signed=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}})
    check(`${role} password login`,signed.status===200,signed)
    clients[role]={id,token:signed.data.access_token,email,refresh:signed.data.refresh_token}
  }
  const admin=clients.admin.token
  let regional=await rpc('set_cafe_region',{p_cafe_slug:cafes[0],p_currency:'USD',p_time_zone:'America/New_York'},admin)
  check('owner saves regional settings before orders',regional.status===204||regional.status===200,regional)
  regional=await rpc('get_cafe_region',{p_cafe_slug:cafes[0]})
  check('public region reflects cafe currency and time zone',regional.data?.[0]?.currency==='USD'&&regional.data[0].time_zone==='America/New_York',regional)
  regional=await rpc('get_cafe_region',{p_cafe_slug:cafes[1]})
  check('region changes do not affect another cafe',regional.data?.[0]?.currency==='ETB',regional)
  for(const token of [undefined,clients.manager.token,clients.adminB.token]) deny('unauthorized regional change rejected',await rpc('set_cafe_region',{p_cafe_slug:cafes[0],p_currency:'EUR',p_time_zone:'UTC'},token))
  deny('invalid time zone rejected',await rpc('set_cafe_region',{p_cafe_slug:cafes[0],p_currency:'USD',p_time_zone:'Not/AZone'},admin))
  await rpc('set_cafe_region',{p_cafe_slug:cafes[0],p_currency:'ETB',p_time_zone:'Africa/Addis_Ababa'},admin)
  const menu={name:'Audit Coffee',price:100,available:true,category:'Drinks',cafe_slug:cafes[0],ingredients:['Milk'],options:[{label:'Size',choices:[{name:'Large',extraPrice:25}]}]}
  let r=await request('/rest/v1/menu_items',{method:'POST',token:admin,body:menu})
  check('owner creates cafe menu',r.status===201,r); menuId=r.data[0].id
  r=await request('/rest/v1/menu_items',{method:'POST',token:clients.adminB.token,body:{...menu,cafe_slug:cafes[1]}})
  check('second cafe creates menu',r.status===201,r); otherMenu=r.data[0].id
  if(process.env.AUDIT_E2E==='1') await auditWorkflow({ cafe:cafes[0],clients,password,check })
  for(const role of ['cashier','barista','superadmin']) {
    deny(`${role} cannot edit catalog`,await request(`/rest/v1/menu_items?id=eq.${menuId}`,{method:'PATCH',token:clients[role].token,body:{price:1}}))
    deny(`${role} cannot insert catalog`,await request('/rest/v1/menu_items',{method:'POST',token:clients[role].token,body:menu}))
    deny(`${role} cannot delete catalog`,await request(`/rest/v1/menu_items?id=eq.${menuId}`,{method:'DELETE',token:clients[role].token}))
  }
  for(const role of ['admin','manager','cashier','barista']) {
    const token=clients[role].token
    deny(`${role} cross-cafe read`,await request(`/rest/v1/menu_items?id=eq.${otherMenu}`,{token}))
    deny(`${role} cross-cafe update`,await request(`/rest/v1/menu_items?id=eq.${otherMenu}`,{method:'PATCH',token,body:{price:1}}))
    deny(`${role} cross-cafe delete`,await request(`/rest/v1/menu_items?id=eq.${otherMenu}`,{method:'DELETE',token}))
    deny(`${role} cross-cafe create`,await request('/rest/v1/menu_items',{method:'POST',token,body:{...menu,cafe_slug:cafes[1]}}))
    deny(`${role} cannot change own role`,await rpc('set_user_role',{p_uid:clients[role].id,p_role:'admin'},token))
    deny(`${role} cannot move membership`,await request(`/rest/v1/user_roles?id=eq.${clients[role].id}`,{method:'PATCH',token,body:{cafe_slug:cafes[1],cafe_id:cafes[1]}}))
  }
  r=await request(`/rest/v1/menu_items?id=eq.${menuId}`,{method:'PATCH',token:clients.manager.token,body:{price:100}})
  check('manager updates own catalog',r.status===200&&r.data.length===1,r)
  r=await request('/rest/v1/tables',{method:'POST',token:admin,body:{id:prefix+'-table',cafe_slug:cafes[0],table_number:2}}); check('owner table create',r.status===201,r)
  r=await request(`/rest/v1/tables?id=eq.${prefix}-table`,{method:'PATCH',token:admin,body:{table_number:3}}); check('owner table update',r.data?.[0]?.table_number===3,r)
  deny('other cafe table update denied',await request(`/rest/v1/tables?id=eq.${prefix}-table`,{method:'PATCH',token:clients.adminB.token,body:{table_number:9}}))
  r=await request(`/rest/v1/tables?id=eq.${prefix}-table`,{method:'DELETE',token:admin}); check('owner table delete',r.data?.length===1,r)
  r=await request('/rest/v1/payment_options',{method:'POST',token:admin,body:{id:prefix+'-bank',cafe_slug:cafes[0],type:'Bank',name:'Audit Bank',active:true}}); check('owner payment configuration create',r.status===201,r)
  r=await request(`/rest/v1/payment_options?id=eq.${prefix}-bank`,{method:'PATCH',token:admin,body:{name:'Updated Bank'}}); check('owner payment configuration update',r.data?.[0]?.name==='Updated Bank',r)
  r=await rpc('get_public_payment_options',{p_cafe_slug:cafes[0]}); check('public active payment configuration read',r.status===200&&r.data.length===1,r)
  r=await request(`/rest/v1/payment_options?id=eq.${prefix}-bank`,{method:'DELETE',token:admin}); check('owner payment configuration delete',r.data?.length===1,r)
  r=await request(`/rest/v1/settings?cafe_slug=eq.${cafes[0]}`,{method:'PATCH',token:admin,body:{tax_rate:15}}); check('owner billing configuration update',r.data?.length===1,r)
  deny('manager cannot alter billing',await request(`/rest/v1/settings?cafe_slug=eq.${cafes[0]}`,{method:'PATCH',token:clients.manager.token,body:{tax_rate:0}}))
  const staffEmail=`${prefix}-staff@example.test`
  r=await rpc('create_staff_user',{p_email:staffEmail,p_password:password,p_display_name:'Audit Staff',p_role:'barista'},admin); check('owner creates staff account',r.status===200,r)
  const staffId=r.data; users.push(staffId)
  r=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:staffEmail,password}}); check('new staff can log in',r.status===200,r.status)
  r=await rpc('set_user_role',{p_uid:staffId,p_role:'cashier'},admin); check('owner changes staff role',r.status===204,r)
  r=await rpc('set_user_disabled',{p_uid:staffId,p_disabled:true},admin); check('owner disables staff',r.status===204,r)
  r=await rpc('delete_staff_user',{p_uid:staffId},admin); check('owner deletes staff',r.status===204,r)
  for(const role of ['manager','cashier','barista']) deny(`${role} cannot configure payments`,await request('/rest/v1/payment_options',{method:'POST',token:clients[role].token,body:{id:prefix+'-'+role,cafe_slug:cafes[0],name:'Bad',type:'Bank'}}))
  for(const role of ['admin','manager']) {
    const token=clients[role].token
    r=await request('/rest/v1/inventory',{method:'POST',token,body:{cafe_slug:cafes[0],name:'Beans',quantity:10,low_stock_threshold:2,supplier_cost:20}})
    check(`${role} inventory create`,r.status===201,r); const id=r.data[0].id
    r=await request(`/rest/v1/inventory?id=eq.${id}`,{method:'PATCH',token,body:{quantity:11}}); check(`${role} inventory update`,r.data?.[0]?.quantity===11,r)
    r=await request(`/rest/v1/inventory?id=eq.${id}`,{token}); check(`${role} inventory read`,r.data?.length===1,r)
    r=await rpc('get_cafe_inventory',{p_cafe_slug:cafes[0]},clients.barista.token); check('barista inventory excludes cost',r.status===200&&!JSON.stringify(r.data).includes('supplier_cost'),r)
    r=await request(`/rest/v1/inventory?id=eq.${id}`,{method:'DELETE',token}); check(`${role} inventory delete`,r.data?.length===1,r)
  }
  r=await rpc('get_public_cafe',{p_cafe_slug:cafes[0]}); check('anonymous safe cafe lookup',r.status===200&&r.data[0].slug===cafes[0]&&!('owner_email' in r.data[0]),r)
  deny('anonymous cafe enumeration blocked',await request('/rest/v1/cafes?select=*'))
  deny('anonymous order enumeration blocked',await request('/rest/v1/orders?select=*'))
  const checkout={p_table_number:'1',p_items:[{itemId:menuId,quantity:2,price:1,name:'Forged',customizations:{Size:[{name:'Large',extraPrice:0}]}}],p_cafe_slug:cafes[0],p_token:customerToken,p_payment_method:'Cash'}
  r=await rpc('create_customer_order',checkout); check('anonymous order creation',r.status===200,r); orderId=r.data
  const retry=await Promise.all([rpc('create_customer_order',checkout),rpc('create_customer_order',checkout)])
  check('checkout retries create one order',retry.every((x)=>x.data===orderId),retry)
  const access={p_order_id:orderId,p_token:customerToken,p_cafe_slug:cafes[0]}
  r=await rpc('get_order_for_tracking',access); check('server prices extras and tax',r.status===200&&r.data.total_amount===287.5&&r.data.items[0].name==='Audit Coffee',r)
  const proofPath = `${cafes[0]}/${orderId}/${crypto.randomUUID()}.png`
  deny('receipt upload without capability denied',await upload('payment-proofs',proofPath))
  r=await upload('payment-proofs',proofPath,null,customerToken); check('customer uploads private receipt',r.status===200,r)
  deny('receipt wrong-tenant upload denied',await upload('payment-proofs',`${cafes[1]}/${orderId}/invalid.png`,null,customerToken))
  const signedPath=`/storage/v1/object/sign/payment-proofs/${proofPath}`
  deny('receipt cannot be signed anonymously',await request(signedPath,{method:'POST',body:{expiresIn:60}}))
  deny('other cafe cannot sign receipt',await request(signedPath,{method:'POST',token:clients.adminB.token,body:{expiresIn:60}}))
  deny('kitchen cannot sign financial receipt',await request(signedPath,{method:'POST',token:clients.barista.token,body:{expiresIn:60}}))
  r=await request(signedPath,{method:'POST',body:{expiresIn:60},headers:{'x-order-token':customerToken}}); check('receipt owner can sign private image',r.status===200,r)
  r=await request(signedPath,{method:'POST',token:clients.cashier.token,body:{expiresIn:60}}); check('own cafe cashier can verify receipt',r.status===200,r)
  r=await rpc('update_customer_order',{...access,p_payment_proof_url:proofPath}); check('receipt attaches to matching order',r.status===204,r)
  deny('forged receipt path rejected',await rpc('update_customer_order',{...access,p_payment_proof_url:`${cafes[1]}/${orderId}/wrong.png`}))
  r=await upload('cafe-assets',`menuImages/${cafes[0]}/test.png`,admin); check('owner can upload menu image',r.status===200,r)
  deny('cross cafe menu upload denied',await upload('cafe-assets',`menuImages/${cafes[1]}/test.png`,admin))
  deny('cashier menu upload denied',await upload('cafe-assets',`menuImages/${cafes[0]}/cashier.png`,clients.cashier.token))
  deny('order UUID alone is insufficient',await rpc('get_order_for_tracking',{p_order_id:orderId,p_cafe_slug:cafes[0]}))
  deny('wrong cafe URL cannot track order',await rpc('get_order_for_tracking',{...access,p_cafe_slug:cafes[1]}))
  deny('another cafe user cannot use leaked customer token',await rpc('get_order_for_tracking',access,clients.adminB.token))
  deny('forged table rejected',await rpc('create_customer_order',{...checkout,p_token:crypto.randomBytes(32).toString('hex'),p_table_number:'999999'}))
  deny('missing quantity rejected',await rpc('create_customer_order',{...checkout,p_token:crypto.randomBytes(32).toString('hex'),p_items:[{itemId:menuId}]}))
  deny('null items rejected',await rpc('create_customer_order',{...checkout,p_token:crypto.randomBytes(32).toString('hex'),p_items:null}))
  deny('mixed cafe items rejected',await rpc('create_customer_order',{...checkout,p_token:crypto.randomBytes(32).toString('hex'),p_items:[{itemId:otherMenu,quantity:1}]}))
  for(const role of ['admin','manager','cashier','barista','superadmin']) {
    deny(`${role} direct payment mutation blocked`,await request(`/rest/v1/orders?id=eq.${orderId}`,{method:'PATCH',token:clients[role].token,body:{payment_status:'paid'}}))
    deny(`${role} direct transaction deletion blocked`,await request(`/rest/v1/orders?id=eq.${orderId}`,{method:'DELETE',token:clients[role].token}))
  }
  r=await rpc('get_staff_orders',{p_cafe_slug:cafes[0]},clients.barista.token)
  check('kitchen orders exclude all monetary values',r.status===200&&r.data.length>0&&!/price|amount|payment|discount|customer_name/i.test(JSON.stringify(r.data)),r)
  deny('kitchen cannot fetch raw financial rows',await request(`/rest/v1/orders?id=eq.${orderId}`,{token:clients.barista.token}))
  deny('kitchen cannot mark paid',await rpc('update_staff_order',{p_order_id:orderId,p_changes:{orderStatus:'paid'}},clients.barista.token))
  deny('cross-tenant RPC update blocked',await rpc('update_staff_order',{p_order_id:orderId,p_changes:{orderStatus:'preparing'}},clients.adminB.token))
  r=await rpc('update_staff_order',{p_order_id:orderId,p_changes:{orderStatus:'preparing'}},clients.barista.token); check('kitchen prepares own order',r.status===204,r)
  for(let i=0;i<2;i++) {
    r=await rpc('update_staff_order',{p_order_id:orderId,p_changes:{discountAmount:25}},clients.cashier.token); check('cashier applies absolute discount',r.status===204,r)
  }
  r=await rpc('get_order_for_tracking',access); check('discount is idempotent and tax recalculated',r.data.total_amount===258.75&&r.data.tax_amount===33.75,r)
  r=await rpc('update_staff_order',{p_order_id:orderId,p_changes:{orderStatus:'ready'}},clients.barista.token); check('kitchen completes own order',r.status===204,r)
  r=await rpc('update_staff_order',{p_order_id:orderId,p_changes:{orderStatus:'paid',paymentStatus:'paid'}},clients.cashier.token); check('cashier takes payment',r.status===204,r)
  deny('paid order cannot be discounted',await rpc('update_staff_order',{p_order_id:orderId,p_changes:{discountAmount:0}},admin))
  deny('customer cannot reopen paid order',await rpc('update_customer_order',{...access,p_payment_method:'Cash'}))
  r=await request('/rest/v1/notifications?select=*',{token:clients.admin.token}); check('notification history belongs to signed-in user',r.status===200&&r.data.length>0&&r.data.every((n)=>n.user_id===clients.admin.id),r)
  r=await request('/rest/v1/notifications?select=*',{token:clients.adminB.token}); check('notification history does not cross cafes',r.status===200&&r.data.length===0,r)
  const provisionRequest=`${prefix}-provision`
  requests.push(provisionRequest)
  r=await request('/rest/v1/subscription_requests',{method:'POST',token:clients.superadmin.token,body:{id:provisionRequest,customer_name:prefix+' provision',email:`${prefix}-newowner@example.test`,plan_key:'enterprise',status:'pending_approval'}})
  check('platform creates pending request',r.status===201,r)
  deny('cafe owner cannot provision tenant',await rpc('provision_cafe_owner',{p_request_id:provisionRequest,p_password:password},admin))
  r=await request('/functions/v1/provision-cafe-owner',{method:'POST',token:clients.superadmin.token,body:{requestId:provisionRequest,temporaryPassword:password}})
  check('platform provisions owner atomically',r.status===200&&r.data.cafe&&r.data.userId,r)
  const provisioned=r.data
  cafes.push(provisioned.cafe.slug); users.push(provisioned.userId)
  r=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:`${prefix}-newowner@example.test`,password}})
  check('provisioned owner can sign in',r.status===200,r.status)
  deny('repeat provisioning rejected',await rpc('provision_cafe_owner',{p_request_id:provisionRequest,p_password:password},clients.superadmin.token))
  const existingRequest=`${prefix}-existing`; requests.push(existingRequest)
  sql(`insert into subscription_requests(id,customer_name,email,plan_key,status) values(${q(existingRequest)},'Existing',${q(clients.admin.email)},'enterprise','pending_approval');`)
  deny('provisioning cannot take over existing account',await rpc('provision_cafe_owner',{p_request_id:existingRequest,p_password:password},clients.superadmin.token))
  r=await request('/functions/v1/delete-cafe',{method:'POST',token:clients.superadmin.token,body:{cafeId:provisioned.cafe.id}})
  check('platform deletes provisioned tenant transactionally',r.status===200&&r.data.summary?.remainingAuthUsers===0,r)
  r=await request('/functions/v1/delete-cafe',{method:'POST',token:admin,body:{cafeId:cafes[1]}}); check('delete edge rejects cafe owner',r.status===403,r)
  r=await request('/functions/v1/send-push',{method:'POST',token:clients.adminB.token,body:{orderId}}); check('push edge rejects cross-cafe order',r.status===403,r)
  r=await request('/functions/v1/send-push',{method:'POST',body:{orderId}}); check('push edge rejects anonymous caller',r.status===401,r)
  deny('cafe owner cannot delete another tenant',await rpc('delete_cafe_tenant',{p_cafe_id:cafes[1]},admin))
  deny('currency cannot relabel existing financial records',await rpc('set_cafe_region',{p_cafe_slug:cafes[0],p_currency:'EUR',p_time_zone:'UTC'},admin))
  sql(`insert into packages(id,name,price,period,status,features,limits) values(${q(testPackage)},'Audit limited','$10','/month','active','["staffAccess"]','{"menuItems":1,"staffUsers":1}'); update subscription_requests set plan_key=${q(testPackage)} where cafe_slug=${q(cafes[0])};`)
  for(const role of ['admin','manager','cashier','barista']) deny(`${role} staff access alone does not grant orders`,await rpc('get_staff_orders',{p_cafe_slug:cafes[0]},clients[role].token))
  deny('raw order reads respect package',await request(`/rest/v1/orders?cafe_slug=eq.${cafes[0]}`,{token:admin}))
  deny('public menu requires digital-menu entitlement',await rpc('get_public_menu',{p_cafe_slug:cafes[0]}))
  deny('order writes respect package',await rpc('update_staff_order',{p_order_id:orderId,p_changes:{estimatedReadyMinutes:10}},admin))
  r=await rpc('get_staff_orders',{p_cafe_slug:cafes[1]},clients.adminB.token);check('another tenant retains its package',r.status===200,r)
  deny('server rejects invalid package limits',await request(`/rest/v1/packages?id=eq.${testPackage}`,{method:'PATCH',token:clients.superadmin.token,body:{limits:{menuItems:0,staffUsers:1}}}))
  deny('a cafe cannot acquire overlapping active subscriptions',await request('/rest/v1/subscription_requests',{method:'POST',token:clients.superadmin.token,body:{id:prefix+'-overlap',cafe_id:cafes[0],cafe_slug:cafes[0],plan_key:'enterprise',status:'active',customer_name:'Overlap',email:'overlap@example.test'}}))
  sql(`update packages set features='["staffAccess","digitalMenu","menuManagement","userManagement"]' where id=${q(testPackage)}; update menu_items set name_am='Translated audit item' where id=${q(menuId)};`)
  r=await rpc('get_public_menu',{p_cafe_slug:cafes[0]});check('translated menu data requires explicit multilingual feature',r.status===200&&r.data[0]?.name_am==null,r)
  deny('server enforces menu usage limit',await request('/rest/v1/menu_items',{method:'POST',token:admin,body:menu}))
  sql(`update packages set limits=jsonb_set(limits,'{menuItems}','2') where id=${q(testPackage)};`)
  const concurrentMenu=await Promise.all([request('/rest/v1/menu_items',{method:'POST',token:admin,body:menu}),request('/rest/v1/menu_items',{method:'POST',token:admin,body:menu})])
  check('concurrent menu inserts cannot exceed the last available slot',concurrentMenu.filter(result=>result.status===201).length===1&&concurrentMenu.filter(result=>result.status>=400).length===1,concurrentMenu)
  deny('server enforces staff usage limit',await rpc('create_staff_user',{p_email:`${prefix}-overlimit@example.test`,p_password:password,p_display_name:'Over limit',p_role:'barista'},admin))
  sql(`update packages set features='["staffAccess","kds"]' where id=${q(testPackage)};`)
  r=await rpc('get_staff_orders',{p_cafe_slug:cafes[0],p_scope:'active'},clients.barista.token);check('explicit KDS feature permits active kitchen queue',r.status===200,r)
  deny('KDS does not imply kitchen history',await rpc('get_staff_orders',{p_cafe_slug:cafes[0],p_scope:'all'},clients.barista.token))
  sql(`update packages set status='inactive' where id=${q(testPackage)};`)
  deny('inactive package revokes access',await rpc('get_staff_orders',{p_cafe_slug:cafes[0],p_scope:'active'},clients.barista.token))
  sql(`update packages set status='active' where id=${q(testPackage)};`)
  sql(`update subscription_requests set expired_at=now()-interval '1 minute' where cafe_slug=${q(cafes[0])};`)
  deny('expiry revokes access without status change',await rpc('get_staff_orders',{p_cafe_slug:cafes[0],p_scope:'active'},clients.barista.token))
  sql(`update subscription_requests set plan_key='enterprise',expired_at=null where cafe_slug=${q(cafes[0])};`)
  sql(`update user_roles set disabled=true where id=${q(clients.cashier.id)};`)
  deny('disabled account existing JWT loses API access',await rpc('get_staff_orders',{p_cafe_slug:cafes[0]},clients.cashier.token))
  deny('disabled account cannot delete cafe via NULL role',await rpc('delete_cafe_tenant',{p_cafe_id:cafes[1]},clients.cashier.token))
  sql(`update cafes set status='suspended' where slug=${q(cafes[0])};`)
  deny('suspended cafe staff access rejected',await rpc('get_staff_orders',{p_cafe_slug:cafes[0]},admin))
  deny('suspended cafe checkout rejected',await rpc('create_customer_order',{...checkout,p_token:crypto.randomBytes(32).toString('hex')}))
  const refresh=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:clients.manager.refresh}})
  check('session refresh',refresh.status===200,refresh.status)
  r=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:clients.admin.email,password:'wrong'}})
  check('invalid credentials rejected',r.status===400,r.status)
  r=await request('/auth/v1/logout',{method:'POST',token:clients.adminB.token})
  check('logout revokes session',r.status===204,r)
  deny('signed-out access token cannot access orders',await rpc('get_staff_orders',{p_cafe_slug:cafes[1]},clients.adminB.token))
  console.log(`Verified ${checks} real API assertions across two isolated cafes.`)
} finally {
  // Delete only fixtures created by this invocation, in FK order.
  const scope=cafes.map(q).join(',')
  for (const { bucket, path } of storageObjects) await request(`/storage/v1/object/${bucket}`,{method:'DELETE',token:service,body:{prefixes:[path]}})
  if (requests.length) sql(`delete from subscription_requests where id in (${requests.map(q).join(',')});`)
  sql(`delete from notifications where cafe_slug in (${scope}); delete from push_subscriptions where cafe_slug in (${scope}); delete from audit_logs where cafe_slug in (${scope}); delete from orders where cafe_slug in (${scope}); delete from inventory where cafe_slug in (${scope}); delete from menu_items where cafe_slug in (${scope}); delete from tables where cafe_slug in (${scope}); delete from payment_options where cafe_slug in (${scope}); delete from settings where cafe_slug in (${scope}); delete from user_roles where cafe_slug in (${scope}); delete from subscription_requests where cafe_slug in (${scope}); delete from cafes where slug in (${scope}); ${users.length ? `delete from auth.users where id in (${users.map(q).join(',')});` : ''}`)
  sql(`delete from packages where id=${q(testPackage)};`)
}
