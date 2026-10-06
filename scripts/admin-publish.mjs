import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { StringDecoder } from 'node:string_decoder'
import { mkdir, mkdtemp, readFile, writeFile, lstat, rename, rm, realpath, open } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { CLOUD_SOURCE } from './admin-maintain.mjs'
import { privateDirectory } from './admin-auth.mjs'
import { publicSnapshot, writePublicSnapshot, validatePublicSnapshot, publicPath } from './publish-content.mjs'
import { BACKUP_ROOTS } from './site-backup.mjs'
import { draftPreview } from './admin-state.mjs'

const exec = promisify(execFile), SHA = /^[a-f0-9]{40}$/
const SSH_SOURCE = 'git@github.com:CoolTrHzZ/Personal_Tool_Site.git'
const API = 'https://api.github.com/repos/CoolTrHzZ/Personal_Tool_Site'
const MAX_PATCH = 65536
export async function runPublishGit(root, args, { input, maxOutputBytes } = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
  Object.assign(env, { GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_COUNT: '0', GIT_ASKPASS: '/usr/bin/false', GIT_SSH_COMMAND: 'ssh -oBatchMode=yes -oStrictHostKeyChecking=yes -oConnectTimeout=10' })
  const command = ['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','gc.auto=0','-c','credential.helper=','-c','http.extraHeader=', ...args]
  try {
    if (maxOutputBytes !== undefined) {
      if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1) throw new Error('Invalid output limit')
      return await new Promise((resolveOutput, reject) => {
        const task = spawn('git', command, { cwd: root, env, timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] })
        const chunks = []; let size = 0
        // Keep only the preview prefix, but drain both pipes and check the actual exit.
        task.stdout.on('data', chunk => {
          const length = Math.min(chunk.length, maxOutputBytes - size)
          if (length > 0) { chunks.push(Buffer.from(chunk.subarray(0, length))); size += length }
        })
        task.stderr.resume()
        task.once('error', reject)
        task.stdin.once('error', reject)
        task.once('close', (code, signal) => {
          if (code !== 0 || signal) { reject(new Error('Git failed')); return }
          // Do not emit a replacement character for a code point split by the cap.
          resolveOutput(new StringDecoder('utf8').write(Buffer.concat(chunks, size)))
        })
        task.stdin.end(input)
      })
    }
    const task = exec('git', command, { cwd: root, env, timeout: 60000, maxBuffer: 4 * 1024 * 1024 })
    task.child.stdin.end(input)
    return (await task).stdout.trim()
  } catch { throw new Error('Git 操作未完成；已保留发布记录，先核对阶段再重试。') }
}
async function apiJson(path) {
  const response = await fetch(API + path, { redirect: 'error', signal: globalThis.AbortSignal.timeout(8000), headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2026-03-10' } })
  if (!response.ok) { await response.body?.cancel(); throw new Error('GitHub 状态暂不可读') }
  const reader = response.body.getReader(), chunks = []; let size = 0
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 2 * 1024 * 1024) throw new Error('状态结果过大'); chunks.push(value) } }
  finally { await reader.cancel().catch(() => {}) }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
export async function readPagesStatus(commit, get = apiJson) {
  if (!SHA.test(commit)) throw new Error('提交标识无效')
  try {
    const runs = await get('/actions/workflows/deploy.yml/runs?branch=main&event=push&head_sha=' + commit + '&per_page=20')
    const run = (runs.workflow_runs || []).filter(item => item.head_sha === commit && item.head_branch === 'main' && item.event === 'push' && item.path === '.github/workflows/deploy.yml').sort((a,b) => b.run_attempt - a.run_attempt || b.id - a.id)[0]
    const deployments = await get('/deployments?sha=' + commit + '&environment=github-pages&per_page=20')
    const deployment = deployments.filter(item => item.sha === commit && item.environment === 'github-pages' && Number.isSafeInteger(item.id)).sort((a,b) => b.id - a.id)[0]
    const statuses = deployment ? await get('/deployments/' + deployment.id + '/statuses?per_page=20') : []
    const status = statuses.filter(item => Number.isSafeInteger(item.id)).sort((a,b) => b.id - a.id)[0]
    const state = status?.state === 'success' ? 'deployed' : status?.state === 'inactive' ? 'superseded' : ['error','failure'].includes(status?.state) || (run?.status === 'completed' && ['failure','cancelled','timed_out','action_required'].includes(run.conclusion)) ? 'failed' : 'pending'
    return { state, checkedAt: new Date().toISOString(), commit, deployedCommit: state === 'deployed' ? commit : null, runId: run?.id || null, runStatus: run?.status || null, conclusion: run?.conclusion || null, deploymentId: deployment?.id || null, deploymentState: status?.state || null }
  } catch { return { state: 'unknown', commit, deployedCommit: null, checkedAt: new Date().toISOString(), message: 'GitHub 状态暂不可读；保留已推送记录，后续刷新，不重复推送。' } }
}
function commitBytes(job) {
  const identity = 'DevOS Admin <devos-admin@users.noreply.github.com> ' + Math.floor(Date.parse(job.createdAt) / 1000) + ' +0000'
  return Buffer.from('tree ' + job.tree + '\nparent ' + job.base + '\nauthor ' + identity + '\ncommitter ' + identity + '\n\nPublish DevOS public content ' + job.id + '\n')
}
const commitHash = bytes => createHash('sha1').update(Buffer.from('commit ' + bytes.length + '\0')).update(bytes).digest('hex')
export function createPublisher({ codeRoot, stateDir, draftRoot, source = CLOUD_SOURCE, pushSource = source === CLOUD_SOURCE ? SSH_SOURCE : source, git = runPublishGit, pages = readPagesStatus }) {
  // Dependency injection is only for module tests; HTTP/CLI never accepts source/ref/command.
  const directory = join(stateDir, 'publisher'), repo = join(directory, 'repo'), journal = join(directory, 'journal.json')
  const exists = path => lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  const call = (...args) => git(repo, args)
  const head = () => call('rev-parse', 'HEAD')
  async function init() {
    await privateDirectory(stateDir, codeRoot)
    await mkdir(directory, { mode: 0o700, recursive: true })
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) throw new Error('发布目录必须为私有实际目录')
  }
  async function load() {
    const info = await exists(journal)
    if (!info) return { version: 1, current: null, history: [] }
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) || info.size > 8 * 1024 * 1024) throw new Error('发布记录不是安全普通文件')
    const data = JSON.parse(await readFile(journal, 'utf8'))
    if (data.version !== 1 || !Array.isArray(data.history)) throw new Error('发布记录格式异常，保留现场')
    const job = data.current
    if (job && (!/^[a-f0-9-]{36}$/.test(job.id) || !SHA.test(job.base) || !SHA.test(job.tree) || (job.commit && !SHA.test(job.commit)) || !['prepared','committing','committed','push_unknown','pushed'].includes(job.stage))) throw new Error('发布记录异常，保留现场')
    return data
  }
  async function save(data) {
    const temp = journal + '.' + randomUUID() + '.tmp'
    const file = await open(temp, 'wx', 0o600)
    try { await file.writeFile(JSON.stringify(data, null, 2) + '\n'); await file.sync() } finally { await file.close() }
    await rename(temp, journal)
  }
  async function locked(action) {
    await init()
    const lock = join(directory, 'publish.lock')
    try { await mkdir(lock, { mode: 0o700 }) } catch (error) { if (error.code === 'EEXIST') throw new Error('已有发布操作；异常中断时先核实 publish.lock/owner.json 进程，不会自动清除现场'); throw error }
    try { await writeFile(join(lock,'owner.json'), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { mode: 0o600 }); return await action() }
    finally { await rm(lock, { recursive: true, force: true }) }
  }
  function view(data) {
    const job = data.current
    return { cloud: true, available: true, branch: 'main', repository: 'CoolTrHzZ/Personal_Tool_Site', job: job ? { id: job.id, base: job.base, commit: job.commit || null, stage: job.stage, files: job.files, patch: job.patch, truncated: job.truncated, publicUrl: job.publicUrl, proposedPublicUrl: job.proposedPublicUrl, createdAt: job.createdAt, lastError: job.lastError || '', pages: job.pages || null, remoteTip: job.remoteTip || null } : null, history: data.history }
  }
  function archive(data) {
    const job = data.current
    if (job) { data.history.unshift({ id: job.id, base: job.base, commit: job.commit || null, stage: job.stage, pages: job.pages || null, archivedAt: new Date().toISOString() }); data.history = data.history.slice(0,20) }
  }
  async function repository() {
    if ((await exists(repo))?.isSymbolicLink() || await realpath(repo) !== resolve(repo) || await realpath(await call('rev-parse','--show-toplevel')) !== resolve(repo) || await call('branch','--show-current') !== 'main' || await call('remote','get-url','origin') !== source) throw new Error('发布工作区必须为固定来源的 main；保留现场')
  }
  async function remote() {
    await repository()
    await call('fetch','--no-tags','origin','refs/heads/main')
    const tip = await call('rev-parse','FETCH_HEAD')
    if (!SHA.test(tip)) throw new Error('远端提交格式无效')
    return tip
  }
  async function reconcile(data) {
    const job = data.current
    if (!job?.commit) return
    let tip
    job.remoteTip = null
    try { tip = await remote() } catch { job.lastError = '无法确认远端提交；保留现有记录，禁止盲目重推。'; if (job.stage === 'pushed') job.pages = { state: 'unknown', commit: job.commit, deployedCommit: null }; await save(data); return }
    job.remoteTip = tip
    let contains = tip === job.commit
    if (!contains) { try { await call('merge-base','--is-ancestor',job.commit,tip); contains = true } catch { /* unrelated/current absent */ } }
    if (contains) { job.stage = 'pushed'; job.lastError = ''; job.pages = await pages(job.commit) }
    else if (job.stage === 'pushed') job.lastError = '远端 main 已不包含本提交；历史发布不能当作当前线上版本，需人工核对。'
    else if (job.stage === 'push_unknown') { job.stage = 'committed'; job.lastError = tip === job.base ? '远端 main 未包含本提交，可显式继续推送原 commit。' : '远端 main 已变化；禁止覆盖，结束此记录后重新预览。' }
    await save(data)
  }
  return {
    async status() { await init(); return view(await load()) },
    async refresh() { return locked(async () => { const data = await load(); await reconcile(data); return view(data) }) },
    async prepare() {
      return locked(async () => {
        const data = await load()
        if (data.current && ['committing','committed','push_unknown'].includes(data.current.stage)) throw new Error('已有提交未完成；先核对/继续原记录，不创建新提交')
        if (!await exists(repo)) {
          if (data.current) throw new Error('发布工作区丢失，保留记录')
          await save(data)
          const stage = await mkdtemp(join(directory,'clone-'))
          try { await git(directory, ['clone','--branch','main','--single-branch','--no-tags','--',source,join(stage,'repo')]); await rename(join(stage,'repo'),repo) }
          finally { await rm(stage,{recursive:true,force:true}) }
        }
        else if (!await exists(journal)) throw new Error('发布工作区存在但缺少记录，需人工核对，不覆盖现场')
        const base = await remote()
        if (data.current?.stage === 'prepared' && await head() !== data.current.base) throw new Error('发布工作区提交与预览记录不一致，保留现场，禁止重置')
        if (data.current?.stage === 'pushed' && await head() !== data.current.commit) throw new Error('已推送工作区的提交已漂移，保留现场')
        await call('reset','--hard',base)
        // Only this dedicated private clone is reset. Runtime code and private drafts are never reset.
        await draftPreview(repo, repo)
        const snapshot = await publicSnapshot(codeRoot, draftRoot), stage = await mkdtemp(join(directory,'validate-'))
        let proposedPublicUrl
        try { proposedPublicUrl = await validatePublicSnapshot(codeRoot, snapshot, stage) } finally { await rm(stage,{recursive:true,force:true}) }
        const publicUrl = JSON.parse(await readFile(join(repo,'src/data/site.json'),'utf8')).publicUrl || ''
        await writePublicSnapshot(snapshot, repo, true)
        await call('add','--all','--',...BACKUP_ROOTS)
        const names = (await call('diff','--cached','--no-renames','--name-only','-z',base)).split('\0').filter(Boolean)
        if (!names.length) throw new Error('草稿与远端 main 相同，没有需要发布的变更')
        if (names.some(path => !publicPath(path))) throw new Error('暂存区出现未支持路径，拒绝发布')
        const statuses = (await call('diff','--cached','--no-renames','--name-status','-z',base)).split('\0').filter(Boolean), incoming = new Map(snapshot.files.map(file => [file.path,file]))
        const files = []
        for (let i=0;i<statuses.length;i+=2) { const path = statuses[i+1], file = incoming.get(path); files.push({ path, action: statuses[i], sha256: file?.sha256 || null, bytes: file?.size || 0 }) }
        const patch = await git(repo, ['diff','--cached','--no-renames','--no-ext-diff','--no-textconv',base,'--',...BACKUP_ROOTS], { maxOutputBytes: MAX_PATCH + 4 })
        const patchBytes = Buffer.from(patch); let end = Math.min(MAX_PATCH, patchBytes.length)
        while (end < patchBytes.length && (patchBytes[end] & 0xc0) === 0x80) end--
        const tree = await call('write-tree')
        archive(data)
        data.current = { id: randomUUID(), stage: 'prepared', base, tree, fingerprint: snapshot.fingerprint, snapshotHash: snapshot.hash, files, patch: patchBytes.subarray(0,end).toString('utf8'), truncated: patchBytes.length > MAX_PATCH, publicUrl, proposedPublicUrl, createdAt: new Date().toISOString() }
        await save(data)
        return view(data)
      })
    },
    async publish({ id, confirmed }) {
      if (confirmed !== true) throw new Error('必须确认公开清单后才能发布')
      return locked(async () => {
        const data = await load(), job = data.current
        if (!job || id !== job.id) throw new Error('发布预览已失效')
        if (job.stage === 'pushed') return view(data)
        await repository()
        if (job.stage === 'prepared') {
          if (Date.now()-Date.parse(job.createdAt)>30*60*1000) throw new Error('发布预览已过期，请重新预览')
          const snapshot = await publicSnapshot(codeRoot,draftRoot)
          if (snapshot.fingerprint !== job.fingerprint || snapshot.hash !== job.snapshotHash || await remote() !== job.base || await head() !== job.base || await call('write-tree') !== job.tree) throw new Error('草稿、远端或暂存区已变化，请重新预览并确认')
          job.commit = commitHash(commitBytes(job)); job.stage = 'committing'; job.confirmedAt = new Date().toISOString(); await save(data)
        }
        if (job.stage === 'push_unknown') { await reconcile(data); if (job.stage !== 'committed') return view(data) }
        try {
          if (job.stage === 'committing') {
            const bytes = commitBytes(job)
            if (commitHash(bytes) !== job.commit) throw new Error('提交记录校验异常')
            const object = await git(repo,['cat-file','--batch-check'],{ input: job.commit + '\n' })
            const present = object.startsWith(job.commit + ' commit ')
            if (!present && object !== job.commit + ' missing') throw new Error('本地提交结果尚不能确认，禁止重复创建')
            if (!present && await git(repo,['hash-object','-t','commit','-w','--stdin'],{ input: bytes }) !== job.commit) throw new Error('提交标识不一致')
            const current = await head()
            if (current === job.base) await call('update-ref','refs/heads/main',job.commit,job.base)
            else if (current !== job.commit) throw new Error('发布本地分支已变化')
            job.stage = 'committed'; await save(data)
          }
          if (job.stage === 'committed') {
            await reconcile(data)
            if (job.stage === 'pushed' || !job.remoteTip) return view(data)
            if (job.remoteTip !== job.base || await head() !== job.commit || await call('rev-parse',job.commit+'^{tree}') !== job.tree) { job.lastError = '远端或本地提交已变化，拒绝覆盖；核对后重新预览。'; await save(data); return view(data) }
            job.stage = 'push_unknown'; job.lastError = '正在推送；若中断，先回读远端 commit。'; await save(data)
            try { await call('push','--porcelain','--',pushSource,job.commit+':refs/heads/main') } catch { /* result must be reconciled, never guessed from exit code */ }
            await reconcile(data)
          }
        } catch { job.lastError = '发布未完成，确切 commit 与阶段已保留；核对后显式继续原记录。'; await save(data) }
        return view(data)
      })
    },
    async abandon({ id, confirmed }) {
      if (confirmed !== true) throw new Error('结束发布记录需明确确认')
      return locked(async () => {
        const data = await load(), job = data.current
        if (!job || job.id !== id) throw new Error('发布记录已变化')
        const current = await head()
        if (job.commit ? current !== job.commit && !(job.stage === 'committing' && current === job.base) : current !== job.base) throw new Error('记录与工作区提交不一致，不能结束未知现场')
        if (job.commit) { await reconcile(data); if (job.stage === 'push_unknown' || !job.remoteTip) throw new Error('远端结果尚不明确，禁止结束未知记录') }
        archive(data); data.current = null; await save(data)
        return view(data)
      })
    },
  }
}
