// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest'
import {createSessionRecovery} from '../../admin/session-recovery.js'
const resources=[]
afterEach(()=>{resources.splice(0).forEach(r=>r.dispose());vi.useRealTimers()})
const json=value=>({ok:true,status:200,json:async()=>value})
const valid=(restoredSession=false)=>({mode:'cloud',authenticated:true,csrf:'synthetic-csrf',restoredSession,idleTtlMs:10000,idleExpiresAt:11000,expiresAt:61000})
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
function fixture(fetcher,hidden=false){
 const doc=new globalThis.EventTarget();doc.hidden=hidden;const events=new globalThis.EventTarget(),session={},calls=[];let clock=1000,recovered=0,unavailable=0
 const recovery=createSessionRecovery({session,doc,events,now:()=>clock,fetcher:async(path,options)=>{calls.push(path);return fetcher(path,options)},onRecovered:()=>recovered++,onUnavailable:()=>unavailable++});resources.push(recovery)
 return{recovery,doc,events,session,calls,clock:()=>clock,tick:ms=>{clock+=ms},recovered:()=>recovered,unavailable:()=>unavailable,visible:()=>{doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));events.dispatchEvent(new Event('focus'));events.dispatchEvent(new Event('pageshow'))}}
}
it('confirms newly restored cookies with a non-restoring request and stops if the short cookie is rejected',async()=>{
 const f=fixture(async path=>path.includes('?')?{ok:false,status:401}:json(valid(true)))
 expect(await f.recovery.recover()).toBe(false);expect(f.calls).toEqual(['/api/auth/session','/api/auth/session?restore=0'])
 f.visible();f.events.dispatchEvent(new Event('focus'));await flush();expect(f.calls).toHaveLength(2);expect(f.recovered()).toBe(0)
})
it('hidden initial entry and hidden restore completion wait for foreground and coalesce focus/pageshow',async()=>{
 let release;const held=new Promise(resolve=>{release=resolve});const f=fixture(async(path)=>path.includes('?')?json(valid(false)):held,true)
 const first=f.recovery.recover();await flush();expect(f.calls).toEqual([])
 f.visible();await flush();expect(f.calls).toHaveLength(1)
 f.doc.hidden=true;release(json(valid(true)));await flush();expect(f.recovered()).toBe(0);expect(f.calls).toHaveLength(1)
 f.visible();expect(await first).toBe(true);expect(f.calls).toHaveLength(2);expect(f.recovered()).toBe(1)
})
it('idle deadlines recover on foreground without submitting an action and open a new cycle after success',async()=>{
 const f=fixture(async()=>json({...valid(false),idleExpiresAt:f.clock()+10000,expiresAt:61000}))
 expect(await f.recovery.recover()).toBe(true);f.doc.hidden=true;f.tick(10001);f.events.dispatchEvent(new Event('focus'));await flush();expect(f.calls).toHaveLength(1)
 f.visible();await flush();expect(f.calls).toHaveLength(2);expect(f.recovered()).toBe(2)
 f.tick(10001);f.visible();await flush();expect(f.calls).toHaveLength(3);expect(f.recovered()).toBe(3)
 expect(f.calls.every(path=>path.startsWith('/api/auth/session'))).toBe(true)
})
it('failed HTTP, malformed JSON and unconfirmed 200 responses stop one cycle until an explicit retry',async()=>{
 for(const kind of [401,403,409,429,503,'non-json','invalid-200']){
  let success=false;const f=fixture(async()=>success?json(valid(false)):typeof kind==='number'?{ok:false,status:kind}:kind==='non-json'?{ok:true,json:async()=>{throw Error('bad json')}}:json({authenticated:true}))
  expect(await f.recovery.recover()).toBe(false);f.visible();await flush();expect(f.calls).toHaveLength(1)
  success=true;expect(await f.recovery.recover({manual:true})).toBe(true);expect(f.calls).toHaveLength(2)
 }
})
it('a timeout stops automatic retries and leaves explicit password confirmation available',async()=>{
 vi.useFakeTimers();let confirm=false
 const f=fixture(async(path,{signal})=>confirm?json(valid(false)):new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('synthetic timeout')),{once:true})))
 const pending=f.recovery.recover();await flush();await vi.advanceTimersByTimeAsync(10001);expect(await pending).toBe(false)
 f.visible();await flush();expect(f.calls).toHaveLength(1)
 confirm=true;expect(await f.recovery.confirmPassword()).toBe(true);expect(f.calls.at(-1)).toBe('/api/auth/session?restore=0')
})
it('logout intent aborts an in-flight restore and late success cannot replace a later password session',async()=>{
 let release;const held=new Promise(resolve=>{release=resolve});let manual=false
 const f=fixture(async()=>manual?json({...valid(false),csrf:'new-password-session'}):held)
 const pending=f.recovery.recover();await flush();f.recovery.suppress();f.visible();manual=true
 expect(await f.recovery.confirmPassword()).toBe(true);release(json({...valid(true),csrf:'old-restore-session'}));expect(await pending).toBe(false)
 expect(f.session.csrf).toBe('new-password-session');expect(f.recovered()).toBe(1)
 f.recovery.suppress();f.tick(20000);f.visible();await flush();expect(f.calls).toHaveLength(2)
})
it('a final visibility gate also holds a cookie confirmation that completes in the background',async()=>{
 let release;const proof=new Promise(resolve=>{release=resolve});const f=fixture(async path=>path.includes('?')?proof:json(valid(true)))
 const pending=f.recovery.recover();await flush();expect(f.calls).toHaveLength(2);f.doc.hidden=true;release(json(valid(false)));await flush();expect(f.recovered()).toBe(0)
 f.visible();expect(await pending).toBe(true);expect(f.recovered()).toBe(1)
})

it('sleep across an idle boundary starts one fresh foreground cycle before cookie confirmation',async()=>{
 let release;const old=new Promise(resolve=>{release=resolve});let first=true
 const f=fixture(async path=>{if(first){first=false;return old}return json({...valid(!path.includes('?')),idleExpiresAt:f.clock()+10000,expiresAt:61000})})
 const pending=f.recovery.recover();await flush();f.doc.hidden=true;f.tick(10001);release(json(valid(true)));await flush();expect(f.calls).toHaveLength(1)
 f.visible();expect(await pending).toBe(true);expect(f.calls).toEqual(['/api/auth/session','/api/auth/session','/api/auth/session?restore=0']);expect(f.recovered()).toBe(1)
})
