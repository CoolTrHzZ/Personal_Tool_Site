// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { request as httpRequest } from 'node:http'
import { Buffer } from 'node:buffer'
import { writePasswordRecord } from '../../scripts/admin-auth.mjs'

const secureOrigin='https://remember.invalid:2087',password='synthetic-http-password-only'
let state,server,address
beforeAll(async()=>{
 state=await mkdtemp(join(tmpdir(),'devos-remember-http-'))
 await writePasswordRecord(state,'synthetic-owner',password)
 server=spawn(process.execPath,[fileURLToPath(new URL('../../scripts/admin-server.mjs',import.meta.url))],{env:{...process.env,ADMIN_MODE:'cloud',ADMIN_PORT:'0',ADMIN_STATE_DIR:state,ADMIN_ORIGIN:secureOrigin},stdio:['ignore','pipe','pipe']})
 let output=''
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Synthetic auth server did not start')),10000);server.stdout.on('data',bytes=>{output+=bytes.toString();const match=output.match(/http:\/\/127\.0\.0\.1:(\d+)/);if(match){clearTimeout(timer);address='http://127.0.0.1:'+match[1];resolve()}});server.once('exit',()=>{clearTimeout(timer);reject(Error('Synthetic auth server exited'))})})
})
afterAll(async()=>{if(server?.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited}if(state)await rm(state,{recursive:true,force:true})})
const pair=cookie=>cookie.split(';')[0]
async function raw(path,{method='GET',cookie='',csrf,body,origin=secureOrigin}={}){
 return new Promise((resolve,reject)=>{
  const req=httpRequest(address+path,{method,headers:{host:'remember.invalid:2087','x-forwarded-proto':'https',origin,'content-type':'application/json',cookie,...(csrf?{'x-csrf-token':csrf}:{})}},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{try{resolve({status:res.statusCode,data:JSON.parse(Buffer.concat(chunks).toString('utf8')),cookies:res.headers['set-cookie']||[]})}catch(error){reject(error)}})})
  req.once('error',reject);req.setTimeout(5000,()=>req.destroy(Error('Synthetic HTTP timeout')));req.end(body===undefined?undefined:JSON.stringify(body))
 })
}
const api=(path,args)=>raw('/api/auth/'+path,args)

it('restores automatically through the real auth route, requires fresh password for sensitive actions and revokes a device',async()=>{
 const login=await api('login',{method:'POST',body:{username:'synthetic-owner',password,rememberDevice:true}})
 expect(login.status).toBe(200);expect(login.cookies).toHaveLength(2)
 const device=pair(login.cookies.find(cookie=>cookie.startsWith('__Host-devos_device=')))
 expect((await api('session',{cookie:device,origin:'https://cross.invalid'})).status).toBe(403)
 const restored=await api('session',{cookie:device});expect(restored.status).toBe(200)
 expect(restored.data).toMatchObject({authenticated:true,rememberedDevice:true,reauthRequired:true})
 const cookie=restored.cookies.map(pair).join('; '),csrf=restored.data.csrf
 expect((await api('remember',{method:'POST',cookie,csrf:'0'.repeat(64),body:{}})).data.code).toBe('CSRF_MISMATCH')
 const sensitive=await raw('/api/backup/restore',{method:'POST',cookie,csrf,body:{}})
 expect(sensitive.status).toBe(428);expect(sensitive.data.code).toBe('REAUTH_REQUIRED')
 expect((await api('reauth',{method:'POST',cookie,csrf,body:{password}})).status).toBe(200)
 expect((await api('session',{cookie})).data.reauthRequired).toBe(false)
 const devices=(await api('devices',{cookie})).data.devices
 expect(devices).toHaveLength(1);expect(devices[0].current).toBe(true)
 expect(Object.keys(devices[0])).not.toContain('hash')
 expect((await api('devices/revoke',{method:'POST',cookie,csrf,body:{id:devices[0].id}})).data).toMatchObject({revoked:true,current:true})
 expect((await api('session',{cookie})).status).toBe(401)
},20000)

it('a proof-only session request never rotates a device or authenticates without the short cookie',async()=>{
 const login=await api('login',{method:'POST',body:{username:'synthetic-owner',password,rememberDevice:true}})
 const device=pair(login.cookies.find(cookie=>cookie.startsWith('__Host-devos_device=')))
 const rejected=await api('session?restore=0',{cookie:device});expect(rejected.status).toBe(401);expect(rejected.cookies).toEqual([])
 const restored=await api('session',{cookie:device});expect(restored.status).toBe(200);expect(restored.data.restoredSession).toBe(true)
 const cookies=restored.cookies.map(pair).join('; '),confirmed=await api('session?restore=0',{cookie:cookies})
 expect(confirmed.status).toBe(200);expect(confirmed.data.restoredSession).toBe(false);expect(confirmed.cookies).toEqual([])
 expect(confirmed.data.idleExpiresAt).toBeGreaterThan(Date.now());expect(confirmed.data.idleTtlMs).toBe(30*60*1000)
 expect((await api('session?restore=0',{cookie:restored.cookies.filter(c=>c.startsWith('__Host-devos_device=')).map(pair).join('; ')})).status).toBe(401)
},20000)


it('device landing is read-only and distinguishes accepted short Cookie from missing or stale device Cookie',async()=>{
 const login=await api('login',{method:'POST',body:{username:'synthetic-owner',password,rememberDevice:true}})
 const short=pair(login.cookies.find(cookie=>cookie.startsWith('__Host-devos_session=')))
 const device=pair(login.cookies.find(cookie=>cookie.startsWith('__Host-devos_device=')))
 const before=await readFile(join(state,'remembered-devices.json'),'utf8')
 for(const [cookie,confirmed] of [[short,false],[short+'; '+device,true],[short+'; __Host-devos_device='+ '0'.repeat(64),false]]) {
  const result=await api('session?restore=0',{cookie})
  expect(result.status).toBe(200);expect(result.data).toMatchObject({authenticated:true,rememberedDevice:true,deviceConfirmed:confirmed,restoredSession:false});expect(result.cookies).toEqual([])
  expect(await readFile(join(state,'remembered-devices.json'),'utf8')).toBe(before)
 }
},20000)
