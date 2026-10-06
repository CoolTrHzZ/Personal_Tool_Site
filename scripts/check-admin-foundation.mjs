// Run with DEVOS_TEST_DIR on a disposable filesystem; no production auth or data is read.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, cp, rm, chmod, readdir, symlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { request as http } from 'node:http'
import { createAuth, passwordRecord, privateDirectory, writePasswordRecord } from './admin-auth.mjs'
import { draftPreview } from './admin-state.mjs'
import { updateCode, rollbackCode } from './admin-maintain.mjs'

const exec = promisify(execFile), code = fileURLToPath(new URL('..', import.meta.url))
if (!process.env.DEVOS_TEST_DIR || !process.env.DEVOS_DEMO_SOURCE) throw new Error('Set DEVOS_TEST_DIR and sanitized DEVOS_DEMO_SOURCE; no internal fallback')
const task = await mkdtemp(join(resolve(process.env.DEVOS_TEST_DIR), 'admin-foundation-'))
const state = join(task, 'state'), project = join(task, 'project'), origin = 'https://workstation.example:19473'
const password = 'synthetic-test-password-only', username = 'fixture_admin'
const results = []
const check = async (name, action) => { await action(); results.push(name); console.log('PASS: ' + name) }

async function codeDriftChecks() {
  const gitAt = (root, ...args) => exec('git', args, { cwd: root }).then(result => result.stdout.trim())
  const commit = async root => { await gitAt(root, 'add', 'code.txt'); await gitAt(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'synthetic code change'); return gitAt(root, 'rev-parse', 'HEAD') }
  const fixture = async name => {
    const base = join(task, name), source = join(base, 'source'), projectDir = join(base, 'code'), stateDir = join(base, 'private')
    await mkdir(join(source, 'scripts'), { recursive: true }); await mkdir(stateDir, { mode: 0o700 })
    for (const name of ['site-backup.mjs', 'tool-manifest.mjs']) await cp(join(code, 'scripts', name), join(source, 'scripts', name))
    await gitAt(source, 'init', '--initial-branch=main')
    await writeFile(join(source, 'code.txt'), 'one'); await gitAt(source, 'add', 'scripts'); await commit(source)
    const options = { source, projectDir, stateDir, validate: async () => {} }
    await updateCode(options)
    await writeFile(join(stateDir, 'auth.json'), 'synthetic-auth-marker', { mode: 0o600 })
    await writeFile(join(stateDir, 'runtime.json'), 'synthetic-config-marker', { mode: 0o600 })
    await mkdir(join(stateDir, 'drafts/src/data'), { recursive: true })
    await writeFile(join(stateDir, 'drafts/src/data/site.json'), '{"title":"latest private draft"}\n')
    await writeFile(join(source, 'code.txt'), 'two'); await commit(source); await updateCode(options)
    return { ...options, previous: projectDir + '.previous' }
  }
  const preserved = async value => {
    assert.equal(await readFile(join(value.stateDir, 'auth.json'), 'utf8'), 'synthetic-auth-marker')
    assert.equal(await readFile(join(value.stateDir, 'runtime.json'), 'utf8'), 'synthetic-config-marker')
    assert.equal(await readFile(join(value.stateDir, 'drafts/src/data/site.json'), 'utf8'), '{"title":"latest private draft"}\n')
    assert.equal((await readdir(value.stateDir)).includes('maintenance.lock'), false)
  }
  await check('update rejects a new clean current commit after validation and preserves both code directories/state', async () => {
    const value = await fixture('update-drift'), previousHead = await gitAt(value.previous, 'rev-parse', 'HEAD')
    await writeFile(join(value.source, 'code.txt'), 'three'); await commit(value.source)
    let changedHead
    await assert.rejects(updateCode({ ...value, validate: async () => {
      await writeFile(join(value.projectDir, 'code.txt'), 'external-clean-current'); changedHead = await commit(value.projectDir)
    } }), /代码目录存在性或提交已变化/)
    assert.equal(await gitAt(value.projectDir, 'rev-parse', 'HEAD'), changedHead)
    assert.equal(await gitAt(value.projectDir, 'status', '--porcelain'), '')
    assert.equal(await readFile(join(value.projectDir, 'code.txt'), 'utf8'), 'external-clean-current')
    assert.equal(await gitAt(value.previous, 'rev-parse', 'HEAD'), previousHead)
    assert.equal(await readFile(join(value.previous, 'code.txt'), 'utf8'), 'one')
    await preserved(value)
  })
  await check('rollback rejects a changed previous HEAD or dirty previous tree and preserves current/state', async () => {
    const value = await fixture('rollback-drift'), currentHead = await gitAt(value.projectDir, 'rev-parse', 'HEAD')
    let previousHead
    await assert.rejects(rollbackCode({ ...value, validate: async () => {
      await writeFile(join(value.previous, 'code.txt'), 'external-clean-previous'); previousHead = await commit(value.previous)
    } }), /代码目录存在性或提交已变化/)
    assert.equal(await gitAt(value.projectDir, 'rev-parse', 'HEAD'), currentHead)
    assert.equal(await readFile(join(value.projectDir, 'code.txt'), 'utf8'), 'two')
    assert.equal(await gitAt(value.previous, 'rev-parse', 'HEAD'), previousHead)
    assert.equal(await gitAt(value.previous, 'status', '--porcelain'), '')
    await assert.rejects(rollbackCode({ ...value, validate: async () => {
      await writeFile(join(value.previous, 'code.txt'), 'external-dirty-previous')
    } }), /本地修改/)
    assert.equal(await gitAt(value.projectDir, 'rev-parse', 'HEAD'), currentHead)
    assert.equal(await gitAt(value.previous, 'rev-parse', 'HEAD'), previousHead)
    assert.equal(await readFile(join(value.previous, 'code.txt'), 'utf8'), 'external-dirty-previous')
    await preserved(value)
  })
  await writeFile(join(task, 'code-drift-summary.json'), JSON.stringify({ passed: results.length, checks: results, workspace: task }, null, 2))
  console.log('Code drift checks passed: ' + results.length + '\nEvidence: ' + task)
}

if (process.argv.includes('--code-drift-only')) await codeDriftChecks()
else {
let child
try {
  await cp(process.env.DEVOS_DEMO_SOURCE, project, { recursive: true })
  for (const directory of ['scripts', 'admin', 'shared']) {
    await rm(join(project, directory), { recursive: true, force: true })
    await cp(join(code, directory), join(project, directory), { recursive: true, filter: source => !source.endsWith('.bak') && !source.endsWith('.tmp') })
  }
  await privateDirectory(state, project)
  const authDir = join(task, 'auth-unit'); await mkdir(authDir, { mode: 0o700 })
  let clock = 1000
  const auth = createAuth({ record: await passwordRecord(username, password), origin, directory: authDir, now: () => clock, sessionTtlMs: 20000, idleMs: 5000 })
  const req = (ip = '192.0.2.1', extras = {}) => ({ headers: { host: 'workstation.example:19473', origin, 'x-forwarded-proto': 'https', 'x-forwarded-for': ip, 'content-type': 'application/json', ...extras }, socket: { remoteAddress: '127.0.0.1' } })
  await check('wrong password, bounded cooldown, independent IP, recovery', async () => {
    assert.equal((await auth.login(req(), username, 'wrong')).status, 401)
    assert.equal((await auth.login(req(), username, password)).status, 429)
    assert.equal((await auth.login(req('192.0.2.2'), username, password)).status, 200)
    clock += 1001
    assert.equal((await auth.login(req(), username, password)).status, 200)
    for (let n = 0; n < 8; n++) { clock += 31000; assert.equal((await auth.login(req(), username, 'wrong')).status, 401); const result = await auth.login(req(), username, 'wrong'); assert.equal(result.status, 429); assert.ok(result.retryAfter <= 30) }
    clock += 31000; assert.equal((await auth.login(req(), username, password)).status, 200)
  })
  await check('global throttling across changing IPs', async () => {
    clock += 31000
    for (let n = 0; n < 5; n++) assert.equal((await auth.login(req('198.51.100.' + n), username, 'wrong')).status, 401)
    assert.equal((await auth.login(req('203.0.113.99'), username, 'wrong')).status, 429)
  })
  await check('secure cookie, CSRF, idle and absolute expiry', async () => {
    clock += 31000
    const login = await auth.login(req(), username, password), cookie = login.cookie.split(';')[0]
    assert.match(login.cookie, /HttpOnly; Secure; SameSite=Strict/)
    const sessionReq = req('192.0.2.1', { cookie, 'x-csrf-token': login.csrf })
    const value = auth.session(sessionReq); assert.ok(value)
    assert.equal(auth.csrfValid(sessionReq, value), true)
    assert.equal(auth.csrfValid(req('192.0.2.1', { cookie, 'x-csrf-token': 'é'.repeat(64) }), value), false)
    assert.equal(auth.csrfValid(req('192.0.2.1', { cookie, origin: 'https://evil.example', 'x-csrf-token': login.csrf }), value), false)
    clock += 5001; assert.equal(auth.session(sessionReq), null)
    clock += 31000
    const absolute = await auth.login(req(), username, password), absoluteReq = req('192.0.2.1', { cookie: absolute.cookie.split(';')[0] })
    for (let n = 0; n < 4; n++) { clock += 4000; assert.ok(auth.session(absoluteReq)) }
    clock += 4000; assert.equal(auth.session(absoluteReq), null)
  })
  await check('audit excludes password, username, token and raw address', async () => {
    const log = await readFile(join(authDir, 'audit.jsonl'), 'utf8')
    for (const secret of [password, username, '192.0.2.', '198.51.100.']) assert.equal(log.includes(secret), false)
    for (const line of log.trim().split('\n')) assert.deepEqual(Object.keys(JSON.parse(line)), ['at', 'event', 'status', 'peer'])
  })
  await writePasswordRecord(state, username, password)
  child = spawn(process.execPath, [join(project, 'scripts/admin-server.mjs')], { cwd: project, env: { ...process.env, ADMIN_MODE: 'cloud', ADMIN_STATE_DIR: state, ADMIN_ORIGIN: origin, ADMIN_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = '', errors = ''
  child.stderr.on('data', chunk => { errors += chunk })
  const port = await new Promise((resolvePort, reject) => {
    const timer = setTimeout(() => reject(new Error('Admin startup timeout: ' + errors)), 10000)
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/127.0.0.1:(\d+)\/admin/); if (match) { clearTimeout(timer); resolvePort(Number(match[1])) } })
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Admin exited: ' + errors)) })
  })
  const call = (path, { method = 'GET', data, headers = {} } = {}) => new Promise((resolveResponse, reject) => {
    const request = http({ host: '127.0.0.1', port, path, method, headers: { host: 'workstation.example:19473', 'x-forwarded-proto': 'https', ...headers } }, response => {
      let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk }); response.on('end', () => { let json; try { json = JSON.parse(body) } catch { json = null }; resolveResponse({ status: response.statusCode, headers: response.headers, body, json }) })
    })
    request.on('error', reject)
    request.end(data === undefined ? undefined : JSON.stringify(data))
  })
  await check('anonymous API rejected, login view only, HTTP origin rejected', async () => {
    for (const path of ['/api/site', '/api/backup', '/api/system', '/api/drafts/preview']) assert.equal((await call(path)).status, 401)
    assert.equal((await call('/admin/')).status, 303)
    assert.equal((await call('/admin/login.html')).status, 200)
    assert.equal((await call('/admin/admin.js')).status, 303)
    assert.equal((await call('/api/site', { headers: { 'x-forwarded-proto': 'http' } })).status, 403)
    assert.equal((await call('/api/auth/login', { method: 'POST', data: { username, password }, headers: { origin: 'https://evil.example', 'content-type': 'application/json' } })).status, 403)
  })
  const login = await call('/api/auth/login', { method: 'POST', data: { username, password }, headers: { origin, 'content-type': 'application/json' } })
  assert.equal(login.status, 200)
  const cookie = login.headers['set-cookie'][0].split(';')[0], csrf = login.json.csrf
  const authorized = { cookie, origin, 'content-type': 'application/json', 'x-csrf-token': csrf }
  await check('authenticated edit requires CSRF and same origin', async () => {
    assert.equal((await call('/api/site', { method: 'PUT', data: { title: 'rejected' }, headers: { cookie, origin, 'content-type': 'application/json' } })).status, 403)
    assert.equal((await call('/api/site', { method: 'PUT', data: { title: 'rejected' }, headers: { ...authorized, origin: 'https://evil.example' } })).status, 403)
    assert.equal((await call('/api/site', { headers: { cookie } })).status, 200)
  })
  const before = await draftPreview(project, project)
  await check('private draft save/preview/validation never modifies source or publishes', async () => {
    assert.equal((await call('/api/site', { method: 'PUT', data: { title: 'PRIVATE_DRAFT_SENTINEL_20261002' }, headers: authorized })).status, 200)
    const preview = await call('/api/drafts/preview', { headers: authorized })
    assert.equal(preview.status, 200); assert.equal(preview.json.publishing, false)
    assert.ok(preview.json.changes.some(item => item.path === 'src/data/site.json'))
    assert.equal((await call('/api/publishing/validate', { method: 'POST', data: {}, headers: authorized })).json.ok, true)
    assert.equal((await draftPreview(project, project)).fingerprint, before.fingerprint)
    const publishing = (await call('/api/publishing', { headers: authorized })).json
    assert.equal(publishing.available, true)
    assert.equal(publishing.job, null)
    assert.deepEqual(publishing.history, [])
    assert.equal((await call('/tools/json-cleaner/index.html', { headers: authorized })).status, 403)
    assert.equal((await call('/api/publishing/push', { method: 'POST', data: {}, headers: authorized })).status, 404)
  })
  await check('backup restore changes private draft only; logout invalidates session', async () => {
    const backup = (await call('/api/backup', { headers: authorized })).json
    const preview = await call('/api/backup/preview', { method: 'POST', data: { content: backup.content }, headers: authorized })
    assert.equal(preview.status, 200)
    assert.equal((await call('/api/backup/restore', { method: 'POST', data: { token: preview.json.token }, headers: authorized })).status, 200)
    assert.equal((await draftPreview(project, project)).fingerprint, before.fingerprint)
    const logout = await call('/api/auth/logout', { method: 'POST', data: {}, headers: authorized })
    assert.equal(logout.status, 200); assert.match(logout.headers['set-cookie'][0], /Max-Age=0/)
    assert.equal((await call('/api/site', { headers: authorized })).status, 401)
  })
  child.kill('SIGTERM'); await new Promise(resolveExit => child.once('exit', resolveExit)); child = null
  await check('cloud refuses startup without auth/state/origin', async () => {
    await assert.rejects(exec(process.execPath, [join(project, 'scripts/admin-server.mjs')], { env: { ...process.env, ADMIN_MODE: 'cloud', ADMIN_STATE_DIR: '', ADMIN_ORIGIN: '' } }), /云模式必须/)
  })
  await check('local mode retains loopback API and no-login session compatibility', async () => {
    child = spawn(process.execPath, [join(project, 'scripts/admin-server.mjs')], { cwd: project, env: { ...process.env, ADMIN_MODE: 'local', ADMIN_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let localOutput = ''
    const localPort = await new Promise((resolvePort, reject) => {
      const timer = setTimeout(() => reject(new Error('local startup timeout')), 10000)
      child.stdout.on('data', chunk => { localOutput += chunk; const match = localOutput.match(/127.0.0.1:(\d+)\/admin/); if (match) { clearTimeout(timer); resolvePort(Number(match[1])) } })
      child.once('exit', () => { clearTimeout(timer); reject(new Error('local admin exited')) })
    })
    const base = 'http://127.0.0.1:' + localPort
    assert.equal((await fetch(base + '/api/auth/session').then(response => response.json())).mode, 'local')
    assert.equal((await fetch(base + '/api/site')).status, 200)
    assert.equal((await fetch(base + '/api/site', { method: 'PUT', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Local fixture edit' }) })).status, 200)
    assert.equal(JSON.parse(await readFile(join(project, 'src/data/site.json'), 'utf8')).title, 'Local fixture edit')
    child.kill('SIGTERM'); await new Promise(resolveExit => child.once('exit', resolveExit)); child = null
  })
  const source = join(task, 'fixture-source'), installed = join(task, 'installed'), maintainState = join(task, 'maintenance-state')
  await mkdir(source); await mkdir(maintainState, { mode: 0o700 })
  const git = (...args) => exec('git', args, { cwd: source }).then(result => result.stdout.trim())
  await git('init', '--initial-branch=main')
  await mkdir(join(source, 'scripts'))
  for (const name of ['site-backup.mjs', 'tool-manifest.mjs']) await cp(join(code, 'scripts', name), join(source, 'scripts', name))
  await writeFile(join(source, 'code.txt'), 'version-one')
  await git('add', 'code.txt', 'scripts'); await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture one')
  const first = await git('rev-parse', 'HEAD')
  const validate = async () => {}
  await updateCode({ projectDir: installed, stateDir: maintainState, source, validate })
  await writeFile(join(maintainState, 'auth.json'), 'synthetic-hash-marker', { mode: 0o600 })
  await writeFile(join(maintainState, 'runtime.json'), 'synthetic-runtime-marker', { mode: 0o600 })
  await cp(join(state, 'drafts'), join(maintainState, 'drafts'), { recursive: true })
  await writeFile(join(source, 'code.txt'), 'version-two'); await git('add', 'code.txt'); await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture two')
  const second = await git('rev-parse', 'HEAD')
  await check('failed candidate validation keeps original code and business state', async () => {
    await assert.rejects(updateCode({ projectDir: installed, stateDir: maintainState, source, validate: async () => { throw new Error('simulated validation failure') } }), /simulated/)
    assert.equal(await readFile(join(installed, 'code.txt'), 'utf8'), 'version-one')
  })
  await check('upgrade and rollback preserve config/auth and latest business draft', async () => {
    const result = await updateCode({ projectDir: installed, stateDir: maintainState, source, validate })
    assert.equal(result.commit, second)
    await writeFile(join(maintainState, 'drafts/src/data/notes.json'), '[]\n')
    const rollback = await rollbackCode({ projectDir: installed, stateDir: maintainState, source, validate })
    assert.equal(rollback.commit, first); assert.equal(rollback.businessDataRestored, false)
    assert.equal(await readFile(join(installed, 'code.txt'), 'utf8'), 'version-one')
    assert.equal(await readFile(join(maintainState, 'drafts/src/data/notes.json'), 'utf8'), '[]\n')
    assert.equal((await readdir(join(maintainState, 'backups'))).length, 1)
    assert.equal(await readFile(join(maintainState, 'auth.json'), 'utf8'), 'synthetic-hash-marker')
    assert.equal(await readFile(join(maintainState, 'runtime.json'), 'utf8'), 'synthetic-runtime-marker')
    assert.equal(JSON.parse(await readFile(join(maintainState, 'release.json'), 'utf8')).commit, first)
  })
  await check('dirty checkout, active service, wrong source and concurrent maintenance rejected', async () => {
    await writeFile(join(installed, 'untracked.txt'), 'do not overwrite')
    await assert.rejects(updateCode({ projectDir: installed, stateDir: maintainState, source, validate }), /本地修改/)
    await rm(join(installed, 'untracked.txt'))
    await writeFile(join(maintainState, 'process.json'), JSON.stringify({ pid: process.pid }), { mode: 0o600 })
    await assert.rejects(updateCode({ projectDir: installed, stateDir: maintainState, source, validate }), /仍在运行/)
    await rm(join(maintainState, 'process.json'))
    await assert.rejects(updateCode({ projectDir: installed, stateDir: maintainState, source: source + '-wrong', validate }), /固定可信/)
    await mkdir(join(maintainState, 'maintenance.lock'), { mode: 0o700 })
    await assert.rejects(updateCode({ projectDir: installed, stateDir: maintainState, source, validate }), /已有维护/)
    await rm(join(maintainState, 'maintenance.lock'), { recursive: true })
    await assert.rejects(privateDirectory(join(installed, 'public/private'), installed), /项目目录之外/)
    await chmod(maintainState, 0o755); await assert.rejects(privateDirectory(maintainState, installed), /0700/); await chmod(maintainState, 0o700)
  })
  await check('draft ancestor symlink cannot redirect writes into source', async () => {
    const unsafe = join(task, 'unsafe-draft')
    await mkdir(unsafe)
    await symlink(join(project, 'src'), join(unsafe, 'src'))
    await assert.rejects(draftPreview(project, unsafe), /符号链接/)
  })
  await writeFile(join(task, 'test-summary.json'), JSON.stringify({ passed: results.length, checks: results, workspace: task }, null, 2))
  console.log('Foundation checks passed: ' + results.length + '\nEvidence: ' + task)
} finally {
  if (child?.exitCode === null && child.signalCode === null) { const exited = new Promise(resolveExit => child.once('exit', resolveExit)); child.kill('SIGTERM'); await exited }
}
}
