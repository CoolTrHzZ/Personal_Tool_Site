#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process'
import { promisify, parseArgs } from 'node:util'
import { mkdir, mkdtemp, readFile, writeFile, lstat, rename, rm, realpath } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { privateDirectory, loadPasswordRecord, writePasswordRecord } from './admin-auth.mjs'

export const CLOUD_SOURCE = 'https://github.com/CoolTrHzZ/Personal_Tool_Site.git'
const REF = 'main', exec = promisify(execFile)
const run = (command, args, cwd) => exec(command, args, { cwd, timeout: 120000, maxBuffer: 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '0' } }).then(result => result.stdout.trim())
const git = (root, ...args) => run('git', args, root)
const identity = source => source.replace(/^git@github.com:/, 'https://github.com/').replace(/^ssh:\/\/git@github.com\//, 'https://github.com/').replace(/\.git\/?$/, '').toLowerCase()
const info = path => lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error })
const inside = (path, parent) => path === parent || path.startsWith(parent + sep)

async function withMaintenance(stateDir, action) {
  const lock = join(stateDir, 'maintenance.lock')
  try { await mkdir(lock, { mode: 0o700 }) }
  catch (error) { if (error.code === 'EEXIST') throw new Error('已有维护/启动操作，先结束该入口；异常中断后核实进程再移除私有 maintenance.lock'); throw error }
  try {
    await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { mode: 0o600 })
    return await action()
  } finally { await rm(lock, { recursive: true, force: true }) }
}
async function stopped(stateDir) {
  const runtime = await readFile(join(stateDir, 'process.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (!runtime) return
  try { process.kill(runtime.pid, 0) }
  catch (error) { if (error.code === 'ESRCH') { await rm(join(stateDir, 'process.json')); return } throw error }
  throw new Error('维护入口仍在运行；先在其前台终端 Ctrl+C 停止，再升级/回退。不会终止其他进程。')
}
async function clean(root, source) {
  if ((await info(root))?.isSymbolicLink() || await realpath(root) !== resolve(root)) throw new Error('项目目录不能经符号链接部署')
  if (await realpath(await git(root, 'rev-parse', '--show-toplevel')) !== await realpath(root)) throw new Error('目录必须是仓库根目录')
  if (identity(await git(root, 'remote', 'get-url', 'origin')) !== identity(source) || await git(root, 'branch', '--show-current') !== REF) throw new Error('云维护只接受固定可信来源的 main 分支')
  if (await git(root, 'status', '--porcelain', '--untracked-files=all')) throw new Error('存在本地修改或未跟踪文件，拒绝覆盖；先自行处理并备份')
}
async function checkedHead(root, source) {
  if (!(await info(root))) return null
  await clean(root, source)
  return git(root, 'rev-parse', 'HEAD')
}
async function unchanged(root, expected, source) {
  if (await checkedHead(root, source) !== expected) throw new Error('代码目录存在性或提交已变化，拒绝交换并保留现场')
}
async function validateCandidate(root, stateDir) {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  if (pkg.name !== 'personal-tool-site' || !(await info(join(root, 'scripts/admin-auth.mjs')))?.isFile()) throw new Error('候选版本尚未包含云管理基础模块')
  for (const name of ['admin-server.mjs', 'admin-auth.mjs', 'admin-state.mjs', 'admin-maintain.mjs']) await run(process.execPath, ['--check', join(root, 'scripts', name)], root)
  await run(process.execPath, [join(root, 'scripts/validate-data.mjs')], root)
  if (await info(join(stateDir, 'drafts'))) await run(process.execPath, [join(root, 'scripts/validate-data.mjs'), join(stateDir, 'drafts')], root)
}
// Source/validator injection is only for isolated module tests; the CLI has no repo/ref overrides.
async function replaceCode({ projectDir, stateDir, source = CLOUD_SOURCE, validate = validateCandidate }) {
  projectDir = resolve(projectDir); stateDir = await privateDirectory(stateDir, projectDir)
  if (inside(stateDir, projectDir + '.previous')) throw new Error('私有 state 不能位于代码回退目录')
  await stopped(stateDir)
  const before = await checkedHead(projectDir, source), installed = before !== null
  const previous = projectDir + '.previous'
  const previousBefore = await checkedHead(previous, source)
  await mkdir(dirname(projectDir), { recursive: true })
  const stage = await mkdtemp(join(dirname(projectDir), '.devos-cloud-'))
  const candidate = join(stage, 'project')
  try {
    await run('git', ['clone', '--branch', REF, '--single-branch', '--no-tags', '--', source, candidate])
    await clean(candidate, source)
    const next = await git(candidate, 'rev-parse', 'HEAD')
    if (installed) {
      if (before === next) return { changed: false, commit: before }
      try { await git(candidate, 'merge-base', '--is-ancestor', before, next) }
      catch { throw new Error('来源不是当前提交的快进版本，保留原代码和草稿') }
    }
    console.log('已固定候选 commit：' + next)
    await writeFile(join(stateDir, 'candidate.json'), JSON.stringify({ commit: next, ref: REF, checkedAt: new Date().toISOString() }) + '\n', { mode: 0o600 })
    await validate(candidate, stateDir)
    await clean(candidate, source)
    if (await git(candidate, 'rev-parse', 'HEAD') !== next) throw new Error('候选提交在校验期间变化，拒绝升级')
    if (installed && await info(join(stateDir, 'drafts'))) {
      const { exportSiteBackup } = await import(pathToFileURL(join(projectDir, 'scripts/site-backup.mjs')).href)
      const backup = await exportSiteBackup(join(stateDir, 'drafts'))
      await mkdir(join(stateDir, 'backups'), { mode: 0o700, recursive: true })
      await writeFile(join(stateDir, 'backups', randomUUID() + '.devos.gz'), Buffer.from(backup.content, 'base64'), { flag: 'wx', mode: 0o600 })
    }
    // Recheck after clone/validation; the admin must remain stopped throughout maintenance.
    await stopped(stateDir)
    await unchanged(candidate, next, source)
    await unchanged(projectDir, before, source)
    await unchanged(previous, previousBefore, source)
    if (installed) {
      await rm(previous, { recursive: true, force: true })
      await rename(projectDir, previous)
    }
    try { await rename(candidate, projectDir) }
    catch (error) { if (installed) await rename(previous, projectDir); throw error }
    await writeFile(join(stateDir, 'release.json'), JSON.stringify({ commit: next, appliedAt: new Date().toISOString(), previous: installed }, null, 2) + '\n', { mode: 0o600 }).catch(() => console.warn('代码已更新；当前提交记录未保存，请根据 candidate.json 核对，草稿未回退'))
    return { changed: true, commit: next, previous: installed }
  } finally { await rm(stage, { recursive: true, force: true }) }
}
async function swapPrevious({ projectDir, stateDir, source = CLOUD_SOURCE, validate = validateCandidate }) {
  projectDir = resolve(projectDir); stateDir = await privateDirectory(stateDir, projectDir)
  if (inside(stateDir, projectDir + '.previous')) throw new Error('私有 state 不能位于代码回退目录')
  await stopped(stateDir)
  const previous = projectDir + '.previous'
  const before = await checkedHead(projectDir, source), previousBefore = await checkedHead(previous, source)
  if (before === null || previousBefore === null) throw new Error('当前或回退代码不存在，保留现场')
  await validate(previous, stateDir)
  await stopped(stateDir)
  const stage = await mkdtemp(join(dirname(projectDir), '.devos-rollback-')), current = join(stage, 'current')
  try {
    await unchanged(projectDir, before, source)
    await unchanged(previous, previousBefore, source)
    await rename(projectDir, current)
    try { await rename(previous, projectDir) }
    catch (error) { await rename(current, projectDir); throw error }
    try { await rename(current, previous) }
    catch (error) { await rename(projectDir, previous); await rename(current, projectDir); throw error }
    const commit = await git(projectDir, 'rev-parse', 'HEAD')
    await writeFile(join(stateDir, 'release.json'), JSON.stringify({ commit, appliedAt: new Date().toISOString(), rollback: true }, null, 2) + '\n', { mode: 0o600 }).catch(() => console.warn('代码已回退；当前提交记录未保存，请核对 git HEAD，草稿未回退'))
    return { commit, businessDataRestored: false }
  } finally { if (!(await info(current))) await rm(stage, { recursive: true, force: true }) }
}
export async function updateCode(options) {
  const stateDir = await privateDirectory(options.stateDir, options.projectDir)
  return withMaintenance(stateDir, () => replaceCode({ ...options, stateDir }))
}
export async function rollbackCode(options) {
  const stateDir = await privateDirectory(options.stateDir, options.projectDir)
  return withMaintenance(stateDir, () => swapPrevious({ ...options, stateDir }))
}
function originValue(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('origin 必须为 HTTPS 域名，可含独立端口，不含路径')
  return url.origin
}
async function hiddenQuestion(prompt) {
  let muted = false
  const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk, encoding); callback() } })
  const input = createInterface({ input: process.stdin, output, terminal: true })
  try {
    const controller = new globalThis.AbortController()
    input.once('SIGINT', () => controller.abort())
    const answer = input.question(prompt, { signal: controller.signal })
    muted = true
    return await answer
  } finally { input.close(); output.end(); process.stdout.write('\n') }
}
async function setup(projectDir, stateDir, values) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('首次设置必须在管理员交互终端运行；密码不接受参数或环境变量')
  if (await info(join(stateDir, 'auth.json'))) throw new Error('认证文件已存在，保留原账号；请使用既有账号')
  const origin = originValue(values.origin || ''), port = Number(values.port || 4174)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('内部端口需为 1024–65535')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  let username
  const controller = new globalThis.AbortController()
  rl.once('SIGINT', () => controller.abort())
  try { username = await rl.question('管理员用户名：', { signal: controller.signal }) } finally { rl.close() }
  const password = await hiddenQuestion('密码（至少 12 字符，不回显）：')
  if (password !== await hiddenQuestion('再输入一次密码：')) throw new Error('两次密码不一致，尚未保存')
  if (await info(join(stateDir, 'runtime.json'))) throw new Error('运行配置已存在，保留现有配置')
  await writePasswordRecord(stateDir, username, password)
  try { await writeFile(join(stateDir, 'runtime.json'), JSON.stringify({ version: 1, projectDir, origin, port }, null, 2) + '\n', { flag: 'wx', mode: 0o600 }) }
  catch (error) { await rm(join(stateDir, 'auth.json')); throw error }
  console.log('设置完成。外部 TLS 入口尚需按确认后的端口配置；服务仍只监听回环。')
}
async function start(projectDir, stateDir) {
  await stopped(stateDir); await loadPasswordRecord(stateDir)
  const configPath = join(stateDir, 'runtime.json'), configInfo = await info(configPath)
  if (!configInfo?.isFile() || configInfo.isSymbolicLink() || (configInfo.mode & 0o077) || (process.getuid && configInfo.uid !== process.getuid())) throw new Error('runtime.json 必须为私有 0600 普通文件')
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  if (config.version !== 1 || config.projectDir !== projectDir || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) throw new Error('私有运行配置与项目目录不匹配')
  const child = spawn(process.execPath, [join(projectDir, 'scripts/admin-server.mjs')], { cwd: projectDir, stdio: 'inherit', env: { ...process.env, ADMIN_MODE: 'cloud', ADMIN_STATE_DIR: stateDir, ADMIN_ORIGIN: originValue(config.origin), ADMIN_PORT: String(config.port) } })
  let failure
  const completion = new Promise(resolveExit => {
    child.once('error', error => { failure = error; resolveExit() })
    child.once('exit', code => { if (code !== 0 && !child.signalCode) failure = new Error('Admin 启动或运行失败，请查看前台输出'); resolveExit() })
  })
  const interrupt = () => child.kill('SIGTERM')
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt)
  try {
    if (!child.pid) throw new Error('启动失败')
    await writeFile(join(stateDir, 'process.json'), JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString() }) + '\n', { mode: 0o600, flag: 'wx' })
    console.log('前台运行；Ctrl+C 停止本入口。status 查看运行标记，logs 查看脱敏审计。')
    await completion
    if (failure) throw failure
  } finally {
    child.kill('SIGTERM')
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt)
    await rm(join(stateDir, 'process.json'), { force: true })
  }
}
export async function cloudMain(args = process.argv.slice(2), defaultProject = fileURLToPath(new URL('..', import.meta.url))) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { project: { type: 'string' }, state: { type: 'string' }, origin: { type: 'string' }, port: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
  if (values.help) { console.log('云 Admin：install | setup | start | status | logs | update | rollback\n--project 代码目录 --state 仓库之外的 0700 私有目录\ninstall/setup 另需 --origin https://服务器域名:外部端口 --port 内部回环端口\n固定官方仓库 main；前台运行；升级/回退前 Ctrl+C 停止。无需 npm/Vite。'); return }
  if (Number(process.versions.node.split('.')[0]) < 22 || !['linux', 'darwin'].includes(process.platform)) throw new Error('云维护需要 Linux/macOS 与 Node.js 22+')
  const command = positionals[0]
  if (!['install', 'setup', 'start', 'status', 'logs', 'update', 'rollback'].includes(command) || positionals.length !== 1 || !values.state) throw new Error('需明确命令与 --state；使用 --help 查看用法')
  const projectDir = resolve(values.project || defaultProject), stateDir = await privateDirectory(values.state, projectDir)
  if (inside(stateDir, projectDir + '.previous')) throw new Error('state 必须在所有代码版本之外')
  if (['install', 'setup'].includes(command)) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('首次安装/设置需本机交互终端，密码不接受参数或环境变量')
    originValue(values.origin || '')
    const port = Number(values.port || 4174)
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('内部端口需为 1024–65535')
  }
  if (command === 'install') {
    if (await info(projectDir)) throw new Error('install 目标须不存在；现有仓库用 setup，升级用 update')
    console.log(await updateCode({ projectDir, stateDir }))
    await withMaintenance(stateDir, () => setup(projectDir, stateDir, values))
  } else if (command === 'setup') { await clean(projectDir, CLOUD_SOURCE); await withMaintenance(stateDir, () => setup(projectDir, stateDir, values)) }
  else if (command === 'start') await withMaintenance(stateDir, () => start(projectDir, stateDir))
  else if (command === 'update') console.log(await updateCode({ projectDir, stateDir }))
  else if (command === 'rollback') console.log(await rollbackCode({ projectDir, stateDir }))
  else if (command === 'status') {
    try { await stopped(stateDir); console.log('stopped：无本入口运行标记') }
    catch (error) { if (error.message.includes('仍在运行')) console.log('运行标记存在；HTTPS 入口是否可用请结合前台输出和实际登录确认'); else throw error }
  } else {
    const path = join(stateDir, 'audit.jsonl'), logInfo = await info(path)
    if (logInfo && (!logInfo.isFile() || logInfo.isSymbolicLink() || (logInfo.mode & 0o077))) throw new Error('审计日志必须是私有普通文件')
    console.log(logInfo ? (await readFile(path, 'utf8')).trim().split('\n').slice(-100).join('\n') : '暂无审计记录')
  }
}
if (process.argv[1] && await realpath(process.argv[1]).catch(() => '') === await realpath(fileURLToPath(import.meta.url))) {
  cloudMain().catch(error => { console.error('云维护未完成：' + error.message); process.exitCode = 1 })
}
