import {test,expect} from '@playwright/test'
import {readFile} from 'node:fs/promises'
import {resolve,extname} from 'node:path'
import {mockAdmin} from './helpers/admin-mock.js'

async function loginFixture(page,restored=false,holdSessionUntilLogin=false){
 const writes=[];let authenticated=restored;let releaseSession;const pending=new Promise(resolve=>{releaseSession=resolve})
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='login.mock')return route.abort()
  if(url.pathname==='/api/auth/session'){if(holdSessionUntilLogin)await pending;return route.fulfill({status:authenticated?200:401,json:authenticated?{mode:'cloud',authenticated:true,csrf:'a'.repeat(64),restoredSession:false}:{authenticated:false}})}
  if(url.pathname==='/api/auth/login'){writes.push(route.request().postDataJSON());authenticated=true;releaseSession();return route.fulfill({json:{authenticated:true}})}
  if(url.pathname==='/admin/')return route.fulfill({body:'<!doctype html><meta charset="utf-8"><h1>合成私有工作站</h1>',contentType:'text/html; charset=utf-8'})
  const target=resolve('.'+url.pathname);try{return await route.fulfill({body:await readFile(target),contentType:extname(target)==='.js'?'text/javascript':extname(target)==='.css'?'text/css':'text/html'})}catch{return route.fulfill({status:404,body:'not found'})}
 })
 await page.goto('https://login.mock/admin/login.html');return writes
}
test('normal password login only remembers the browser after explicit seven-day opt-in',async({page})=>{
 const writes=await loginFixture(page)
 const remember=page.getByRole('checkbox',{name:'记住此浏览器 7 天，到期前自动恢复登录'})
 await expect(remember).not.toBeChecked();await remember.check()
 await page.getByLabel('用户名',{exact:true}).fill('synthetic-owner')
 await page.getByLabel('密码',{exact:true}).fill('synthetic-browser-password-only')
 await page.getByRole('button',{name:'登录',exact:true}).click()
 await expect(page.getByRole('heading',{name:'合成私有工作站'})).toBeVisible()
 expect(writes).toHaveLength(1);expect(writes[0].rememberDevice).toBe(true)
})
test('remembered-device restoration enters admin without password input or a continue click',async({page})=>{
 const writes=await loginFixture(page,true)
 await expect(page.getByRole('heading',{name:'合成私有工作站'})).toBeVisible();expect(writes).toEqual([])
})
test('an already executed write returning 401 is never replayed after recovery until the user confirms again',async({page})=>{
 let sessions=0,saves=0,executedEffects=0;const csrfTokens=[]
 const {requests,errors,collections}=await mockAdmin(page,async(route,url,collections)=>{
  if(url.pathname==='/api/auth/session'){sessions++;await route.fulfill({json:{mode:'cloud',authenticated:true,csrf:sessions===1?'first-synthetic-csrf':'restored-synthetic-csrf',restoredSession:sessions===2}});return true}
  if(url.pathname==='/api/ai/status'){await route.fulfill({json:{configured:false}});return true}
  if(url.pathname==='/api/navigation'&&route.request().method()==='POST'){
   saves++;executedEffects++;csrfTokens.push(route.request().headers()['x-csrf-token'])
   if(saves===1){
    // The synthetic write has already affected server data before its generic 401 arrives.
    collections.navigation.push(route.request().postDataJSON())
    await route.fulfill({status:401,json:{error:'Synthetic session expired after executing the write'}});return true
   }
  }
  return false
 })
 await page.locator('#dashboard-add-website').click();const form=page.locator('#nav-form')
 await form.locator('[name="name"]').fill('合成已执行标题');await form.locator('[name="url"]').fill('https://example.invalid/remember-test')
 const save=form.getByRole('button',{name:'保存私有草稿',exact:true});await save.click()
 await expect(form.locator('.form-error')).toContainText('原操作结果尚未确认')
 await expect(form.locator('.form-error')).toContainText('重新确认执行')
 await expect(page.locator('#editor-drawer')).toBeVisible()
 await expect(form.locator('[name="name"]')).toHaveValue('合成已执行标题');await expect(form.locator('[name="url"]')).toHaveValue('https://example.invalid/remember-test')
 expect(sessions).toBe(3);expect(saves).toBe(1);expect(executedEffects).toBe(1)
 expect(collections.navigation.filter(item=>item.name==='合成已执行标题')).toHaveLength(1)
 await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'))})
 expect(saves).toBe(1);expect(requests.filter(item=>item.method!=='GET').map(item=>item.path)).toEqual(['/api/navigation'])
 // Only this explicit second user action may send another write with the restored CSRF.
 await save.click();await expect(page.locator('#editor-drawer')).toBeHidden()
 expect(saves).toBe(2);expect(executedEffects).toBe(2);expect(csrfTokens).toEqual(['first-synthetic-csrf','restored-synthetic-csrf'])
 expect(requests.filter(item=>item.method!=='GET').map(item=>item.path)).toEqual(['/api/navigation','/api/navigation']);expect(errors).toEqual([])
})
test('device opt-in rechecks password and logout offers forgetting without automatically signing in again',async({page})=>{
 const writes=[];let remembered=false
 const {errors}=await mockAdmin(page,async(route,url)=>{
  if(url.pathname==='/api/auth/session'){await route.fulfill({json:{mode:'cloud',authenticated:true,csrf:'synthetic-csrf',restoredSession:false}});return true}
  if(url.pathname==='/api/ai/status'){await route.fulfill({json:{configured:false}});return true}
  if(url.pathname==='/api/auth/devices'){await route.fulfill({json:{devices:remembered?[{id:'a'.repeat(32),expiresAt:Date.now()+86400000,current:true}]:[]}});return true}
  if(['/api/auth/reauth','/api/auth/remember','/api/auth/logout'].includes(url.pathname)){writes.push({path:url.pathname,body:route.request().postDataJSON()});if(url.pathname==='/api/auth/remember')remembered=true;await route.fulfill({json:{authenticated:true,rememberedDevice:remembered}});return true}
  return false
 })
 await page.locator('#admin-account-menu summary').click()
 await page.getByRole('button',{name:'登录设备',exact:true}).click()
 await page.getByRole('button',{name:'记住此浏览器 7 天',exact:true}).click()
 await expect(page.getByRole('heading',{name:'重新验证密码',exact:true})).toBeVisible()
 expect(writes).toEqual([])
 await page.getByLabel('管理员密码',{exact:true}).fill('synthetic-browser-password-only')
 await page.getByRole('button',{name:'验证密码',exact:true}).click()
 await expect(page.getByRole('heading',{name:'再次确认操作',exact:true})).toBeVisible()
 expect(writes.map(item=>item.path)).toEqual(['/api/auth/reauth'])
 await page.getByRole('button',{name:'确认执行',exact:true}).click()
 await expect(page.locator('#modal-body')).toContainText('当前设备')
 expect(writes.map(item=>item.path)).toEqual(['/api/auth/reauth','/api/auth/remember'])
 await page.locator('#modal-cancel').click()
 await page.locator('#admin-account-menu summary').click()
 await page.getByRole('button',{name:'退出登录',exact:true}).click()
 await expect(page.getByRole('checkbox',{name:'同时忘记此设备',exact:true})).toBeChecked()
 await page.getByRole('checkbox',{name:'同时忘记此设备',exact:true}).uncheck()
 await page.locator('#modal-ok').click()
 await expect(page).toHaveURL(/login\.html\?signed_out=1$/)
 await expect(page.getByRole('button',{name:'登录',exact:true})).toBeVisible()
 expect(writes.at(-1)).toEqual({path:'/api/auth/logout',body:{forgetDevice:false}})
 expect(errors).toEqual([])
})


test('password submit stays protected while automatic restoration is still pending',async({page})=>{
 const writes=await loginFixture(page,false,true)
 await page.getByLabel('用户名',{exact:true}).fill('synthetic-owner')
 await page.getByLabel('密码',{exact:true}).fill('synthetic-pending-password-only')
 await page.getByRole('button',{name:'登录',exact:true}).click()
 await expect(page.getByRole('heading',{name:'合成私有工作站'})).toBeVisible()
 expect(writes).toHaveLength(1);expect(writes[0].rememberDevice).toBe(false)
 expect(page.url()).not.toContain('password')
})

test('a restored response without a working short Cookie stays on login and focus cannot loop',async({page})=>{
 let sessions=0,proofs=0,logins=0
 await loginFixture(page)
 await expect(page.locator('#message')).toContainText('自动恢复未完成')
 await page.route('**/api/auth/session*',async route=>{if(new URL(route.request().url()).search){proofs++;return route.fulfill({status:401,json:{authenticated:false}})}sessions++;return route.fulfill({json:{mode:'cloud',authenticated:true,csrf:'a'.repeat(64),restoredSession:true}})})
 await page.route('**/api/auth/login',async route=>{logins++;return route.fulfill({json:{authenticated:true}})})
 await page.reload();await expect(page.locator('#message')).toContainText('自动恢复未完成')
 await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'));document.dispatchEvent(new Event('visibilitychange'))})
 await expect(page).toHaveURL(/login\.html$/);expect(sessions).toBe(1);expect(proofs).toBe(1)
 await page.getByLabel('用户名',{exact:true}).fill('synthetic-owner');await page.getByLabel('密码',{exact:true}).fill('synthetic-cookie-rejected-password')
 await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.locator('#message')).toContainText('登录会话未生效')
 expect(logins).toBe(1);expect(sessions).toBe(1);expect(proofs).toBe(2)
})
test('hidden login waits for visibility and a response that arrives hidden cannot navigate early',async({page})=>{
 let sessions=0,release;const held=new Promise(resolve=>{release=resolve})
 await page.addInitScript(()=>{window.__syntheticHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__syntheticHidden})})
 await loginFixture(page)
 await page.route('**/api/auth/session*',async route=>{sessions++;if(!new URL(route.request().url()).search){await held;return route.fulfill({json:{mode:'cloud',authenticated:true,csrf:'a'.repeat(64),restoredSession:true}})}return route.fulfill({json:{mode:'cloud',authenticated:true,csrf:'b'.repeat(64),restoredSession:false}})})
 await page.evaluate(()=>{window.__syntheticHidden=false;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'))})
 await expect.poll(()=>sessions).toBe(1)
 await page.evaluate(()=>{window.__syntheticHidden=true});release()
 await expect(page).toHaveURL(/login\.html$/);expect(sessions).toBe(1)
 await page.evaluate(()=>{window.__syntheticHidden=false;document.dispatchEvent(new Event('visibilitychange'))})
 await expect(page.getByRole('heading',{name:'合成私有工作站'})).toBeVisible();expect(sessions).toBe(2)
})
test('foreground expiry preserves a real editor draft on restore success and password fallback without auto-save',async({page})=>{
 let clock=Date.parse('2026-10-03T16:00:00Z'),sessions=0,fail=false,loggedIn=false,logins=0
 await page.clock.install({time:new Date(clock)})
 const {requests,errors}=await mockAdmin(page,async(route,url)=>{
  if(url.pathname==='/api/auth/session'){
   sessions++;if(fail&&!loggedIn)return route.fulfill({status:401,json:{authenticated:false}}).then(()=>true)
   await route.fulfill({json:{mode:'cloud',authenticated:true,csrf:(sessions===1?'a':'b').repeat(64),restoredSession:sessions===2,idleTtlMs:10000,idleExpiresAt:clock+10000,expiresAt:clock+60000}});return true
  }
  if(url.pathname==='/api/ai/status'){await route.fulfill({json:{configured:false}});return true}
  if(url.pathname==='/api/auth/login'){logins++;loggedIn=true;await route.fulfill({json:{authenticated:true}});return true}
  return false
 })
 await page.locator('#dashboard-add-website').click();const form=page.locator('#nav-form'),name=form.locator('[name="name"]')
 await name.fill('不自动保存的合成草稿');await form.locator('[name="url"]').fill('https://example.invalid/draft')
 clock+=10001;await page.clock.fastForward(10001)
 await expect.poll(()=>sessions).toBe(3);await expect(name).toHaveValue('不自动保存的合成草稿')
 expect(requests.filter(r=>r.method!=='GET')).toEqual([])
 fail=true;clock+=10001;await page.clock.fastForward(10001)
 await expect(page.locator('#auth-recovery')).toBeVisible();await expect(name).toHaveValue('不自动保存的合成草稿')
 await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'))});expect(sessions).toBe(4)
 await page.locator('#auth-signin').click();await page.getByLabel('用户名',{exact:true}).fill('synthetic-owner');await page.getByLabel('密码',{exact:true}).fill('synthetic-in-place-password')
 await page.getByRole('button',{name:'登录并保留草稿',exact:true}).click();await expect(page.locator('#auth-recovery')).toBeHidden();await expect(name).toHaveValue('不自动保存的合成草稿')
 expect(logins).toBe(1);expect(requests.filter(r=>r.method!=='GET').map(r=>r.path)).toEqual(['/api/auth/login']);expect(errors).toEqual([])
})
test('a lost retain-device logout response suppresses all automatic recovery and later unauthorized writes',async({page})=>{
 let sessions=0,logout=0,saves=0
 const {errors}=await mockAdmin(page,async(route,url)=>{
  if(url.pathname==='/api/auth/session'){sessions++;await route.fulfill({json:{mode:'cloud',authenticated:true,csrf:'a'.repeat(64),restoredSession:false}});return true}
  if(url.pathname==='/api/ai/status'){await route.fulfill({json:{configured:false}});return true}
  if(url.pathname==='/api/auth/logout'){logout++;expect(route.request().postDataJSON().forgetDevice).toBe(false);await route.abort('failed');return true}
  if(url.pathname==='/api/navigation'&&route.request().method()==='POST'){saves++;await route.fulfill({status:401,json:{error:'synthetic logged out'}});return true}
  return false
 })
 await page.locator('#admin-account-menu summary').click()
 await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.getByRole('checkbox',{name:'同时忘记此设备',exact:true}).uncheck();await page.locator('#modal-ok').click()
 await expect(page.locator('#auth-recovery')).toContainText('自动登录恢复已暂停')
 await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'));document.dispatchEvent(new Event('visibilitychange'))})
 await page.locator('#dashboard-add-website').click();const form=page.locator('#nav-form')
 await form.locator('[name="name"]').fill('退出意图后的未发送草稿');await form.locator('[name="url"]').fill('https://example.invalid/logout-intent')
 // The recovery notice may cover the submit button; submit the form directly to test the request guard.
 await form.evaluate(node=>node.requestSubmit());await expect(form.locator('.form-error')).toContainText('已暂停自动登录恢复');await expect(form.locator('[name="name"]')).toHaveValue('退出意图后的未发送草稿')
 expect(logout).toBe(1);expect(sessions).toBe(1);expect(saves).toBe(0);expect(errors).toEqual([])
})

for(const outcome of ['cancel-password','wrong-password','cancel-confirmation','confirm']){
 test('sensitive publish '+outcome+' preserves its draft and executes only after the second confirmation',async({page})=>{
  let attempted=0,executed=0,reauth=0,recent=false
  const info={job:{id:'a'.repeat(32),stage:'prepared',files:[{path:'src/data/site.json',action:'replace',bytes:32}],patch:'synthetic public difference'},history:[]}
  const {errors}=await mockAdmin(page,async(route,url)=>{
   if(url.pathname==='/api/auth/session'){await route.fulfill({json:{mode:'cloud',authenticated:true,csrf:'a'.repeat(64),restoredSession:false}});return true}
   if(url.pathname==='/api/ai/status'){await route.fulfill({json:{configured:false}});return true}
   if(url.pathname==='/api/publishing'){await route.fulfill({json:info});return true}
   if(url.pathname==='/api/publishing/publish'){attempted++;if(!recent)await route.fulfill({status:428,json:{code:'REAUTH_REQUIRED'}});else{executed++;await route.fulfill({json:{...info,job:{...info.job,stage:'pushed'}}})}return true}
   if(url.pathname==='/api/auth/reauth'){reauth++;recent=outcome!=='wrong-password';await route.fulfill({status:recent?200:401,json:recent?{authenticated:true}:{error:'Synthetic password rejected'}});return true}
   return false
  })
  await page.locator('[data-settings-shortcut="deploy"]').first().click()
  const draft=page.locator('#site [name="publicUrl"]');await draft.fill('https://example.invalid/keep-sensitive-draft')
  await page.getByRole('button',{name:'确认公开并发布',exact:true}).click();await page.getByRole('button',{name:'确认公开并执行',exact:true}).click()
  await expect(page.getByRole('heading',{name:'重新验证密码',exact:true})).toBeVisible();expect(executed).toBe(0)
  if(outcome==='cancel-password')await page.locator('#modal-cancel').click()
  else{
   await page.getByLabel('管理员密码',{exact:true}).fill('synthetic-sensitive-password');await page.getByRole('button',{name:'验证密码',exact:true}).click()
   if(outcome==='wrong-password')await expect(page.locator('.toasts')).toContainText('Synthetic password rejected')
   else{await expect(page.getByRole('heading',{name:'再次确认操作',exact:true})).toBeVisible();expect(executed).toBe(0);await page.locator(outcome==='confirm'?'#modal-ok':'#modal-cancel').click()}
  }
  await expect(draft).toHaveValue('https://example.invalid/keep-sensitive-draft')
  await expect.poll(()=>attempted).toBe(outcome==='confirm'?2:1)
  expect(executed).toBe(outcome==='confirm'?1:0);expect(reauth).toBe(outcome==='cancel-password'?0:1);expect(errors).toEqual([])
 })
}


test('a dropped device Set-Cookie keeps the accepted short login usable and warns before the next expired login stops',async({page})=>{
 let phase='bootstrap',sessions=0,logins=0,sawShort=false
 const short='__Host-devos_session='+ 'd'.repeat(64)
 const {errors}=await mockAdmin(page,async(route,url)=>{
  if(url.pathname==='/api/auth/session') {
   if(phase==='bootstrap'){await route.fulfill({json:{mode:'cloud',authenticated:true,csrf:'a'.repeat(64),restoredSession:false}});return true}
   sessions++;const cookie=route.request().headers().cookie||'';sawShort ||= cookie.includes(short)
   if(phase==='expired'||!cookie.includes(short)){await route.fulfill({status:401,json:{authenticated:false}});return true}
   expect(cookie).not.toContain('__Host-devos_device=')
   await route.fulfill({json:{mode:'cloud',authenticated:true,csrf:'b'.repeat(64),restoredSession:false,rememberedDevice:true,deviceConfirmed:false}});return true
  }
  if(url.pathname==='/api/auth/login') {
   logins++;phase='logged-in'
   // The isolated synthetic browser receives only the short Cookie; the device Set-Cookie is deliberately dropped.
   await route.fulfill({headers:{'set-cookie':short+'; Secure; HttpOnly; Path=/; SameSite=Strict; Max-Age=60'},json:{authenticated:true,rememberedDevice:true}});return true
  }
  if(url.pathname==='/api/ai/status'){await route.fulfill({json:{configured:false}});return true}
  return false
 })
 phase='login';await page.goto('https://admin.mock/admin/login.html')
 await expect(page.locator('#message')).toContainText('自动恢复未完成')
 await page.getByLabel('用户名',{exact:true}).fill('synthetic-owner');await page.getByLabel('密码',{exact:true}).fill('synthetic-device-cookie-only')
 await page.getByRole('checkbox',{name:'记住此浏览器 7 天，到期前自动恢复登录'}).check()
 await page.getByRole('button',{name:'登录',exact:true}).click()
 await expect(page).toHaveURL('https://admin.mock/admin/')
 await expect(page.locator('#auth-recovery')).toBeVisible();await expect(page.locator('#auth-recovery-message')).toContainText('7 天设备记忆尚未确认')
 await page.locator('#dashboard-add-website').click();await expect(page.locator('#nav-form')).toBeVisible()
 expect(logins).toBe(1);expect(sawShort).toBe(true)
 phase='expired';await page.goto('https://admin.mock/admin/login.html')
 await expect(page.locator('#message')).toContainText('自动恢复未完成');const count=sessions
 await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'))})
 await expect(page).toHaveURL('https://admin.mock/admin/login.html');expect(sessions).toBe(count);expect(logins).toBe(1);expect(errors).toEqual([])
})
