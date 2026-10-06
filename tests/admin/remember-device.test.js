// @vitest-environment node
import { afterEach, beforeAll, expect, it } from 'vitest'
import { mkdtemp, readFile, lstat, rm, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAuth, passwordRecord } from '../../scripts/admin-auth.mjs'
import { DEVICE_TTL_MS } from '../../scripts/admin-devices.mjs'

const password='synthetic-test-password-only', origin='https://remember.invalid:2087', roots=[]
let record
beforeAll(async()=>{record=await passwordRecord('synthetic-owner',password)})
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})))})
const request=(cookie='',method='GET',csrf)=>({method,headers:{host:'remember.invalid:2087','x-forwarded-proto':'https',origin,'content-type':'application/json',cookie,...(csrf?{'x-csrf-token':csrf}:{})},socket:{remoteAddress:'127.0.0.1'}})
const cookiePair=cookie=>cookie.split(';')[0]
const deviceCookie=issued=>cookiePair(issued.cookies.find(cookie=>cookie.startsWith('__Host-devos_device=')))
async function fixture(){const directory=await mkdtemp(join(tmpdir(),'devos-remember-'));roots.push(directory);let time=Date.now();const options={record,origin,directory,now:()=>time,sessionTtlMs:60000,idleMs:10000};return{directory,options,auth:createAuth(options),tick:ms=>{time+=ms},time:()=>time}}

it('requires opt-in, keeps existing password/rate/CSRF checks and issues short sessions only by default',async()=>{
 const {auth,directory}=await fixture(),req=request('', 'POST')
 const bad=await auth.login(req,'synthetic-owner','wrong-synthetic-password');expect(bad.status).toBe(401)
 expect((await auth.login(req,'synthetic-owner',password)).status).toBe(429)
 const good=await auth.login({...req,headers:{...req.headers,'x-forwarded-for':'127.0.0.2'}},'synthetic-owner',password)
 expect(good.rememberedDevice).toBe(false)
 expect(good.cookies.find(cookie=>cookie.startsWith('__Host-devos_device='))).toContain('Max-Age=0')
 expect(await lstat(join(directory,'remembered-devices.json')).catch(error=>error.code)).toBe('ENOENT')
 const session=auth.session(request(cookiePair(good.cookie)))
 expect(auth.csrfValid(request(cookiePair(good.cookie),'POST',good.csrf),session)).toBe(true)
 expect(auth.csrfValid({...request(cookiePair(good.cookie),'POST',good.csrf),headers:{...request(cookiePair(good.cookie),'POST',good.csrf).headers,origin:'https://cross.invalid'}},session)).toBe(false)
})
it('persists only hashes, automatically restores after expiry/restart, rotates tokens and enforces fixed seven-day expiry',async()=>{
 const {auth,directory,options,tick,time}=await fixture(),issued=await auth.login(request('','POST'),'synthetic-owner',password,true)
 expect(issued.status).toBe(200);expect(issued.rememberedDevice).toBe(true)
 const initialDevice=deviceCookie(issued),plaintext=initialDevice.split('=')[1],file=join(directory,'remembered-devices.json'),stored=await readFile(file,'utf8'),entry=JSON.parse(stored).devices[0]
 expect(stored).not.toContain(plaintext);expect(stored).not.toContain(password);expect(stored).not.toContain(record.hash)
 expect((await lstat(file)).mode&0o777).toBe(0o600)
 expect(entry.expiresAt-entry.createdAt).toBe(DEVICE_TTL_MS)
 expect(issued.cookies[1]).toContain('Path=/; HttpOnly; Secure; SameSite=Strict')
 tick(11000);expect(auth.session(request(cookiePair(issued.cookie)))).toBeNull()
 const restarted=createAuth(options),restored=await restarted.restore(request(initialDevice))
 expect(restored).toBeTruthy();expect(restored.csrf).not.toBe(issued.csrf);expect(restarted.fresh(restored.value)).toBe(false)
 expect(deviceCookie(restored)).not.toBe(initialDevice)
 expect(await restarted.restore(request(initialDevice))).toBeNull()
 expect((await restarted.listDevices(restored.value))[0].expiresAt).toBe(entry.expiresAt)
 expect(restarted.csrfValid(request(cookiePair(restored.cookie),'POST',restored.csrf),restored.value)).toBe(true)
 tick(entry.expiresAt-time()-1000)
 const last=await restarted.restore(request(deviceCookie(restored)))
 expect(last.expiresAt).toBe(entry.expiresAt)
 tick(1000);expect(restarted.session(request(cookiePair(last.cookie)))).toBeNull()
 expect(await restarted.restore(request(deviceCookie(last)))).toBeNull()
})
it('preserves a retained device on intentional logout and revokes forgotten devices and their sessions',async()=>{
 const {auth}=await fixture(),issued=await auth.login(request('','POST'),'synthetic-owner',password,true)
 const cookie=cookiePair(issued.cookie)+'; '+deviceCookie(issued),session=auth.session(request(cookie))
 const cleared=await auth.logout(request(cookie,'POST',issued.csrf),session,false)
 expect(cleared).toHaveLength(1);expect(auth.session(request(cookie))).toBeNull()
 const restored=await auth.restore(request(deviceCookie(issued)))
 expect(restored).toBeTruthy()
 const revokeCookies=await auth.revoke(request(deviceCookie(restored),'POST',restored.csrf),restored.value,restored.value.deviceId)
 expect(revokeCookies).toHaveLength(2);expect(auth.session(request(cookiePair(restored.cookie)))).toBeNull()
 expect(await auth.restore(request(deviceCookie(restored)))).toBeNull()
 const other=await auth.login(request('','POST'),'synthetic-owner',password,true)
 const otherSession=auth.session(request(cookiePair(other.cookie)))
 expect(await auth.logout(request(deviceCookie(other),'POST',other.csrf),otherSession,true)).toHaveLength(2)
 expect(await auth.restore(request(deviceCookie(other)))).toBeNull()
})
it('requires password recheck for remembered sessions and never slides the device expiry',async()=>{
 const {auth,tick}=await fixture(),issued=await auth.login(request('','POST'),'synthetic-owner',password,true)
 const restored=await auth.restore(request(deviceCookie(issued)))
 expect(auth.fresh(restored.value)).toBe(false)
 await expect(auth.remember(request(deviceCookie(restored)),restored.value)).rejects.toMatchObject({statusCode:428})
 const before=(await auth.listDevices(restored.value))[0].expiresAt
 const verified=await auth.reauthenticate(request('','POST',restored.csrf),restored.value,password)
 expect(verified.status).toBe(200)
 const verifiedSession=auth.session(request(cookiePair(restored.cookie)));expect(auth.fresh(verifiedSession)).toBe(true)
 expect((await auth.listDevices(restored.value))[0].expiresAt).toBe(before)
 tick(5*60*1000)
 expect(auth.fresh(verifiedSession)).toBe(false)
})
it('rejects tokens after password rotation and fails closed on unsafe private record permissions',async()=>{
 const {auth,options,directory}=await fixture(),issued=await auth.login(request('','POST'),'synthetic-owner',password,true)
 const rotated=createAuth({...options,record:await passwordRecord('synthetic-owner','different-synthetic-password')})
 expect(await rotated.restore(request(deviceCookie(issued)))).toBeNull()
 const fresh=await rotated.login(request('','POST'),'synthetic-owner','different-synthetic-password',true)
 await chmod(join(directory,'remembered-devices.json'),0o644)
 await expect(rotated.restore(request(deviceCookie(fresh)))).rejects.toMatchObject({statusCode:503})
})

it.each([[false,true],[true,true],[false,false],[true,false]])('cannot issue a restorable device after concurrent logout (remembered: %s, forget: %s)',async(remembered,forget)=>{
 const {auth}=await fixture(),issued=await auth.login(request('','POST'),'synthetic-owner',password,remembered)
 const cookie=cookiePair(issued.cookie)+'; '+deviceCookie(issued),req=request(cookie,'POST',issued.csrf),session=auth.session(req)
 const pending=auth.remember(req,session)
 const results=await Promise.allSettled([pending,auth.logout(req,session,forget)])
 const restored=results[0].status==='fulfilled' ? await auth.restore(request(cookiePair(results[0].value))) : null
 expect(restored).toBeNull()
 expect(results[0]).toMatchObject({status:'rejected',reason:{statusCode:401}})
 expect(results[1].status).toBe('fulfilled')
 expect(await auth.listDevices(session)).toEqual([])
 expect(auth.session(request(cookie))).toBeNull()
})

it.each([false,true])('remembers an active session and logout revokes its latest device despite an older request snapshot (already remembered: %s)',async remembered=>{
 const {auth}=await fixture(),issued=await auth.login(request('','POST'),'synthetic-owner',password,remembered)
 const cookie=cookiePair(issued.cookie)+'; '+deviceCookie(issued),req=request(cookie,'POST',issued.csrf),snapshot=auth.session(req)
 const rememberedCookie=await auth.remember(req,snapshot)
 const current=auth.session(request(cookie))
 expect(current).toBeTruthy();expect(current.key).toBe(snapshot.key)
 expect(await auth.deviceConfirmed(request(cookiePair(rememberedCookie)),current)).toBe(true)
 expect(await auth.listDevices(current)).toHaveLength(1)
 if(remembered)expect(await auth.restore(request(deviceCookie(issued)))).toBeNull()
 await auth.logout(req,snapshot,true)
 expect(await auth.restore(request(cookiePair(rememberedCookie)))).toBeNull()
 expect(await auth.listDevices(snapshot)).toEqual([])
 expect(auth.session(request(cookie))).toBeNull()
})

it.each([[false,0],[false,1],[true,0],[true,1]])('serializes same-session registration and forgets every response token despite reversed arrival (remembered: %s, last response: %s)',async(remembered,lastResponse)=>{
 const {auth}=await fixture(),issued=await auth.login(request('','POST'),'synthetic-owner',password,remembered)
 const short=cookiePair(issued.cookie),cookie=short+'; '+deviceCookie(issued),req=request(cookie,'POST',issued.csrf),snapshot=auth.session(req)
 const results=await Promise.all([auth.remember(req,snapshot),auth.remember(req,snapshot)])
 const current=auth.session(request(short))
 expect(await auth.listDevices(current)).toHaveLength(1)
 expect(await auth.deviceConfirmed(request(cookiePair(results[0])),current)).toBe(false)
 expect(await auth.deviceConfirmed(request(cookiePair(results[1])),current)).toBe(true)
 // Either HTTP response can arrive last; logout must use server state, not that Cookie or stale snapshot.
 const browserCookie=short+'; '+cookiePair(results[lastResponse])
 await auth.logout(request(browserCookie,'POST',issued.csrf),snapshot,true)
 expect(await auth.listDevices(snapshot)).toEqual([])
 for(const result of results) expect(await auth.restore(request(cookiePair(result)))).toBeNull()
 if(remembered)expect(await auth.restore(request(deviceCookie(issued)))).toBeNull()
 expect(auth.session(request(short))).toBeNull()
})

it('does not let queued same-session registration resurrect a logged-out session',async()=>{
 const {auth}=await fixture(),issued=await auth.login(request('','POST'),'synthetic-owner',password)
 const req=request(cookiePair(issued.cookie),'POST',issued.csrf),snapshot=auth.session(req)
 const registrations=[auth.remember(req,snapshot),auth.remember(req,snapshot)]
 const results=await Promise.allSettled([...registrations,auth.logout(req,snapshot,true)])
 expect(results.slice(0,2)).toEqual([expect.objectContaining({status:'rejected'}),expect.objectContaining({status:'rejected'})])
 expect(results[2].status).toBe('fulfilled')
 expect(await auth.listDevices(snapshot)).toEqual([])
 expect(auth.session(req)).toBeNull()
})
