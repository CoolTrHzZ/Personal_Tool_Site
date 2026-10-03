import assert from 'node:assert/strict'
import { TextEncoder } from 'node:util'
import { mkdtemp, mkdir, cp, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { request as http } from 'node:http'
import { createPublisher, runPublishGit, readPagesStatus } from './admin-publish.mjs'
import { publicSnapshot, publicPath } from './publish-content.mjs'
import { prepareDrafts } from './admin-state.mjs'
import { writePasswordRecord } from './admin-auth.mjs'

if (!process.env.DEVOS_TEST_DIR || !process.env.DEVOS_DEMO_SOURCE) throw new Error('Provide external DEVOS_TEST_DIR and sanitized DEVOS_DEMO_SOURCE; no fallback')
const task = await mkdtemp(join(process.env.DEVOS_TEST_DIR,'publish-check-')), code = fileURLToPath(new URL('..', import.meta.url))
const seed = join(task,'seed'), checks = []
await cp(process.env.DEVOS_DEMO_SOURCE,seed,{recursive:true})
await cp(join(code,'.gitignore'),join(seed,'.gitignore'))
for (const folder of ['scripts','shared','admin']) await cp(join(code,folder),join(seed,folder),{recursive:true,filter:path=>!path.endsWith('.bak')})
await runPublishGit(seed,['init','--initial-branch=main'])
await runPublishGit(seed,['add','--all'])
await runPublishGit(seed,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Synthetic baseline'])
const initial = await runPublishGit(seed,['rev-parse','HEAD'])
const check = async (name,action) => { await action();checks.push(name);console.log('PASS: '+name) }
async function scenario(name, transport = runPublishGit) {
  const root=join(task,name), state=join(root,'private'), bare=join(root,'remote.git')
  await mkdir(root);await mkdir(state,{mode:0o700})
  await runPublishGit(root,['clone','--bare','--',seed,bare])
  const draft=await prepareDrafts(seed,state)
  for (const file of ['auth.json','ai-provider.json','runtime.json']) await writeFile(join(state,file),JSON.stringify({ synthetic:'PRIVATE_PUBLISH_SENTINEL' }),{mode:0o600})
  const sitePath=join(draft,'src/data/site.json')
  const edit=async value=>{ const site=JSON.parse(await readFile(sitePath,'utf8'));site.title=value;await writeFile(sitePath,JSON.stringify(site,null,2)+'\n') }
  await edit('Public '+name)
  const options={codeRoot:seed,stateDir:state,draftRoot:draft,source:bare,git:transport,pages:async commit=>({state:'pending',commit,deployedCommit:null})}
  return { root,state,bare,draft,sitePath,edit,options,publisher:createPublisher(options), tip:()=>runPublishGit(root,['--git-dir='+bare,'rev-parse','main']) }
}
await check('narrow paths/fields reject private and unsupported uploads; failed validation can be corrected',async()=>{
  const s=await scenario('schema'),site=JSON.parse(await readFile(s.sitePath,'utf8'))
  await writeFile(s.sitePath,JSON.stringify({...site,apiKey:'PRIVATE_PUBLISH_SENTINEL'}))
  await assert.rejects(s.publisher.prepare(),/公开字段/)
  await writeFile(s.sitePath,JSON.stringify(site,null,2)+'\n')
  await mkdir(join(s.draft,'public/images'));await writeFile(join(s.draft,'public/images/avatar.png'),'synthetic image')
  await assert.rejects(publicSnapshot(seed,s.draft),/不支持公开路径/)
  await rm(join(s.draft,'public/images'),{recursive:true})
  await writeFile(join(s.draft,'src/data/provider.json'),'{}')
  await assert.rejects(publicSnapshot(seed,s.draft),/私有路径/)
  await rm(join(s.draft,'src/data/provider.json'))
  await mkdir(join(s.draft,'public/tools/unregistered'));await writeFile(join(s.draft,'public/tools/unregistered/index.html'),'<script>untrusted</script>')
  await assert.rejects(publicSnapshot(seed,s.draft),/未注册工具路径/)
  await rm(join(s.draft,'public/tools/unregistered'),{recursive:true})
  await symlink(s.state,join(s.draft,'public/tools/private-link'))
  await assert.rejects(publicSnapshot(seed,s.draft),/符号链接/)
  await rm(join(s.draft,'public/tools/private-link'))
  assert.equal(publicPath('public/tools/demo/.env'),false)
  const plan=await s.publisher.prepare();assert.equal(plan.job.stage,'prepared');assert.equal(await s.tip(),initial)
})
await check('preview has public differences, requires confirmation, rejects stale draft, and publishes only content',async()=>{
  const s=await scenario('confirmed');let plan=await s.publisher.prepare()
  assert.equal(plan.job.commit,null);assert.deepEqual(plan.job.files.map(f=>f.path),['src/data/site.json'])
  const large=await scenario('utf8-preview',async(root,args,opts)=>{ const value=await runPublishGit(root,args,opts);return args[0]==='diff'&&args.includes('--no-textconv')?value+'\n'+'中文'.repeat(30000):value })
  const bounded=await large.publisher.prepare();assert.equal(bounded.job.truncated,true);assert.ok(new TextEncoder().encode(bounded.job.patch).length<=65536);assert.equal(bounded.job.patch.includes('\ufffd'),false)
  assert.match(plan.job.patch,/Public confirmed/);assert.equal(plan.job.patch.includes('PRIVATE_PUBLISH_SENTINEL'),false)
  await assert.rejects(s.publisher.publish({id:plan.job.id,confirmed:false}),/必须确认/)
  await s.edit('Edited after preview')
  await assert.rejects(s.publisher.publish({id:plan.job.id,confirmed:true}),/已变化/)
  plan=await s.publisher.prepare()
  const result=await s.publisher.publish({id:plan.job.id,confirmed:true})
  assert.equal(result.job.stage,'pushed');assert.equal(result.job.pages.state,'pending')
  assert.equal(await s.tip(),result.job.commit);assert.equal(await runPublishGit(seed,['rev-parse','HEAD']),initial)
  assert.deepEqual((await runPublishGit(s.root,['--git-dir='+s.bare,'diff-tree','--no-commit-id','--name-only','-r',result.job.commit])).split('\n'),['src/data/site.json'])
  const paths=await runPublishGit(s.root,['--git-dir='+s.bare,'ls-tree','-r','--name-only',result.job.commit])
  assert.equal(/(?:^|\n)(?:.*\/)?(?:auth|ai-provider|runtime)\.json(?:\n|$)/.test(paths),false)
  assert.equal((await s.publisher.publish({id:plan.job.id,confirmed:true})).job.commit,result.job.commit)
})
await check('commit recorded but rejected push resumes same commit, without a second commit object',async()=>{
  let deny=true,unreadable=false,writes=0,pushes=0
  const transport=async(root,args,opts)=>{if(args[0]==='fetch'&&unreadable)throw new Error('synthetic unavailable');if(args[0]==='hash-object')writes++;if(args[0]==='push'){pushes++;if(deny)throw new Error('synthetic denial')}return runPublishGit(root,args,opts)}
  const s=await scenario('retry',transport),plan=await s.publisher.prepare()
  let result=await s.publisher.publish({id:plan.job.id,confirmed:true}),commit=result.job.commit
  assert.equal(result.job.stage,'committed');assert.equal(await s.tip(),initial);assert.equal(writes,1)
  deny=false;unreadable=true
  result=await createPublisher(s.options).publish({id:plan.job.id,confirmed:true})
  assert.equal(result.job.stage,'committed');assert.equal(result.job.remoteTip,null);assert.equal(pushes,1)
  unreadable=false
  result=await createPublisher(s.options).publish({id:plan.job.id,confirmed:true})
  assert.equal(result.job.commit,commit);assert.equal(result.job.stage,'pushed');assert.equal(writes,1);assert.equal(pushes,2)
})
await check('push success with lost response/readback stays unknown, then reconciles without another push',async()=>{
  let lose=true,failFetch=false,writes=0,pushes=0
  const transport=async(root,args,opts)=>{
    if(args[0]==='hash-object')writes++
    if(args[0]==='fetch'&&failFetch){failFetch=false;throw new Error('synthetic unavailable')}
    if(args[0]==='push'){pushes++;const value=await runPublishGit(root,args,opts);if(lose){lose=false;failFetch=true;throw new Error('lost response')}return value}
    return runPublishGit(root,args,opts)
  }
  const s=await scenario('unknown',transport),plan=await s.publisher.prepare()
  let result=await s.publisher.publish({id:plan.job.id,confirmed:true})
  assert.equal(result.job.stage,'push_unknown');assert.equal(await s.tip(),result.job.commit)
  const commit=result.job.commit
  result=await createPublisher(s.options).publish({id:plan.job.id,confirmed:true})
  assert.equal(result.job.stage,'pushed');assert.equal(result.job.commit,commit);assert.equal(pushes,1);assert.equal(writes,1)
})
await check('lost commit-object/ref response uses journal SHA lookup, with no duplicate object/ref mutation',async()=>{
  for(const operation of ['hash-object','update-ref','cat-file']){
    let lost=true,count=0
    const transport=async(root,args,opts)=>{if(args[0]===operation){count++;const value=await runPublishGit(root,args,opts);if(lost){lost=false;throw new Error('lost local response')}return value}return runPublishGit(root,args,opts)}
    const s=await scenario('local-'+operation,transport),plan=await s.publisher.prepare()
    let result=await s.publisher.publish({id:plan.job.id,confirmed:true})
    assert.equal(result.job.stage,'committing');assert.match(result.job.commit,/^[a-f0-9]{40}$/)
    const commit=result.job.commit
    result=await createPublisher(s.options).publish({id:plan.job.id,confirmed:true})
    assert.equal(result.job.stage,'pushed');assert.equal(result.job.commit,commit);assert.equal(count,operation==='cat-file'?2:1)
  }
})
await check('remote advance refuses stale preview and committed push; explicit abandon preserves history/drafts',async()=>{
  const s=await scenario('advance'),plan=await s.publisher.prepare(),other=join(s.root,'other')
  await runPublishGit(s.root,['clone','--branch','main','--',s.bare,other])
  await writeFile(join(other,'README.remote'),'synthetic concurrent writer')
  await runPublishGit(other,['add','README.remote']);await runPublishGit(other,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Concurrent main'])
  await runPublishGit(other,['push','origin','main'])
  await assert.rejects(s.publisher.publish({id:plan.job.id,confirmed:true}),/已变化/)
  const next=await s.publisher.prepare();assert.notEqual(next.job.base,initial)
  let advanceOnce=true,pushes=0
  s.options.git=async(root,args,opts)=>{
    const value=await runPublishGit(root,args,opts)
    if(args[0]==='push')pushes++
    if(args[0]==='update-ref'&&advanceOnce){advanceOnce=false;await writeFile(join(other,'README.remote'),'second concurrent writer');await runPublishGit(other,['add','README.remote']);await runPublishGit(other,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Concurrent after commit']);await runPublishGit(other,['push','origin','main'])}
    return value
  }
  const pub=createPublisher(s.options),result=await pub.publish({id:next.job.id,confirmed:true})
  assert.equal(result.job.stage,'committed');assert.equal(pushes,0)
  const draft=await readFile(s.sitePath,'utf8'),committedWork=join(s.state,'publisher/repo')
  await runPublishGit(committedWork,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','-m','Unrecorded committed ref drift'])
  const unrecorded=await runPublishGit(committedWork,['rev-parse','HEAD'])
  await assert.rejects(pub.abandon({id:next.job.id,confirmed:true}),/不能结束/)
  assert.equal(await runPublishGit(committedWork,['rev-parse','HEAD']),unrecorded)
  await runPublishGit(committedWork,['update-ref','refs/heads/main',result.job.commit,unrecorded])
  const abandoned=await pub.abandon({id:next.job.id,confirmed:true})
  assert.equal(abandoned.job,null);assert.equal(abandoned.history[0].commit,result.job.commit);assert.equal(await readFile(s.sitePath,'utf8'),draft)
  const drift=await scenario('local-drift');await drift.publisher.prepare()
  const work=join(drift.state,'publisher/repo')
  await runPublishGit(work,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Simulated unrecorded ref change'])
  const changed=await runPublishGit(work,['rev-parse','HEAD'])
  await assert.rejects(drift.publisher.prepare(),/保留现场/)
  const status=await drift.publisher.status()
  await assert.rejects(drift.publisher.abandon({id:status.job.id,confirmed:true}),/不能结束/)
  assert.equal(await runPublishGit(work,['rev-parse','HEAD']),changed);assert.equal(await drift.tip(),initial)
})
await check('exact SHA plus github-pages deployment required; missing/queued is pending, API unavailable is unknown',async()=>{
  const sha='a'.repeat(40),wrong='b'.repeat(40)
  const run={id:4,head_sha:sha,head_branch:'main',event:'push',path:'.github/workflows/deploy.yml',status:'completed',conclusion:'success',run_attempt:1}
  let deployments=[],state='queued'
  const get=async path=>path.startsWith('/actions/')?{workflow_runs:[{...run,id:99,head_sha:wrong},run]}:path.includes('/statuses')?[{id:30,state}]:deployments
  assert.equal((await readPagesStatus(sha,get)).state,'pending')
  deployments=[{id:7,sha:wrong,environment:'github-pages'},{id:8,sha,environment:'elsewhere'}]
  assert.equal((await readPagesStatus(sha,get)).state,'pending')
  deployments.push({id:9,sha,environment:'github-pages'})
  assert.equal((await readPagesStatus(sha,get)).state,'pending')
  state='success';assert.equal((await readPagesStatus(sha,get)).deployedCommit,sha)
  state='inactive';assert.equal((await readPagesStatus(sha,get)).state,'superseded')
  assert.equal((await readPagesStatus(sha,async()=>{throw new Error('synthetic rate limit')})).state,'unknown')
})
await check('new HTTP publishing writes require auth/CSRF/confirmation and reject arbitrary remote/ref',async()=>{
  const state=join(task,'http-private');await mkdir(state,{mode:0o700});await writePasswordRecord(state,'publish_admin','synthetic-publisher-password-only')
  const origin='https://publish.fixture.test:19473'
  const child=spawn(process.execPath,[join(seed,'scripts/admin-server.mjs')],{cwd:seed,env:{...process.env,ADMIN_MODE:'cloud',ADMIN_STATE_DIR:state,ADMIN_ORIGIN:origin,ADMIN_PORT:'0'},stdio:['ignore','pipe','pipe']})
  let output='',errors=''
  child.stderr.on('data',chunk=>{errors+=chunk})
  try{
    const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(errors||'startup timeout')),10000);child.stdout.on('data',chunk=>{output+=chunk;const m=output.match(/127.0.0.1:(\d+)\/admin/);if(m){clearTimeout(timer);resolve(Number(m[1]))}});child.once('exit',()=>{clearTimeout(timer);reject(new Error(errors))})})
    const req=(path,{method='GET',data,headers={}}={})=>new Promise((resolve,reject)=>{const r=http({host:'127.0.0.1',port,path,method,headers:{host:'publish.fixture.test:19473','x-forwarded-proto':'https',...headers}},res=>{let text='';res.on('data',chunk=>{text+=chunk});res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,json:JSON.parse(text)}))});r.on('error',reject);r.end(data===undefined?undefined:JSON.stringify(data))})
    assert.equal((await req('/api/publishing')).status,401)
    const login=await req('/api/auth/login',{method:'POST',data:{username:'publish_admin',password:'synthetic-publisher-password-only'},headers:{origin,'content-type':'application/json'}})
    const headers={cookie:login.headers['set-cookie'][0].split(';')[0],origin,'content-type':'application/json','x-csrf-token':login.json.csrf}
    assert.equal((await req('/api/publishing/prepare',{method:'POST',data:{},headers:{...headers,'x-csrf-token':''}})).status,403)
    for(const data of [{remote:'http://never.example'},{branch:'other'},{command:'never'}])assert.equal((await req('/api/publishing/prepare',{method:'POST',data,headers})).status,400)
    assert.equal((await req('/api/publishing/publish',{method:'POST',data:{id:'synthetic',confirmed:false},headers})).status,400)
    assert.equal((await req('/api/publishing',{headers})).json.job,null)
  }finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve))}
})
await writeFile(join(task,'publish-summary.json'),JSON.stringify({passed:checks.length,checks,workspace:task,realRemoteActions:0,realProviderCalls:0},null,2))
console.log('Publish checks passed: '+checks.length+'\nEvidence: '+task)
