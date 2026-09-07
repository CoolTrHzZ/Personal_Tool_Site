#!/usr/bin/env node
// Standalone bootstrap: this file can be downloaded before the repository exists.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { Buffer } from 'node:buffer'

export const DEFAULT_REPOSITORY = 'https://github.com/CoolTrHzZ/Personal_Tool_Site.git'
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const windows = process.platform === 'win32'

function execute(command, args, { cwd, visible = false, shell = false } = {}) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, { cwd, shell, stdio: visible ? 'inherit' : ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
    let output = '', error = ''
    const interrupt = () => child.kill('SIGTERM')
    const cleanup = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt) }
    process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt)
    child.stdout?.on('data', chunk => { output += chunk })
    child.stderr?.on('data', chunk => { error += chunk })
    child.on('error', error => { cleanup(); reject(error) })
    child.on('close', code => {
      cleanup()
      if (code === 0) resolveCommand(output.trim())
      else reject(new Error(`${command} 执行失败 (${code})${error ? `：${error.trim()}` : ''}`))
    })
  })
}
const git = (directory, ...args) => execute('git', args, { cwd: directory })

async function assertProject(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  if (manifest.name !== 'personal-tool-site') throw new Error(`目标目录不是 Personal Tool Site：${directory}`)
  for (const file of ['scripts/admin-server.mjs', 'scripts/validate-data.mjs']) {
    if (!(await stat(join(directory, file))).isFile()) throw new Error(`项目缺少 ${file}`)
  }
}

function repositoryIdentity(value) {
  // GitHub HTTPS and SSH remotes identify the same checkout.
  const github = value.match(/^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)(.+?)(?:\.git)?\/?$/i)
  return github ? `github.com/${github[1].toLowerCase()}` : value.replace(/\/$/, '')
}

export async function prepareProject({ directory, repository = DEFAULT_REPOSITORY, update = false }) {
  directory = resolve(directory)
  if (!existsSync(directory)) {
    await mkdir(dirname(directory), { recursive: true })
    const temporary = await mkdtemp(join(dirname(directory), '.devos-install-'))
    try {
      console.log(`下载项目到 ${directory}`)
      const checkout = join(temporary, 'project')
      await execute('git', ['clone', '--branch', 'main', '--single-branch', '--', repository, checkout], { visible: true })
      await assertProject(checkout)
      await rename(checkout, directory)
    } finally { await rm(temporary, { recursive: true, force: true }) }
    return
  }
  await assertProject(directory)
  if (!update) return
  if (await realpath(await git(directory, 'rev-parse', '--show-toplevel')) !== await realpath(directory)) throw new Error('目标必须是项目仓库根目录。')
  if (repositoryIdentity(await git(directory, 'remote', 'get-url', 'origin')) !== repositoryIdentity(repository)) throw new Error('origin 与部署仓库不一致；使用 --repo 明确指定自己的仓库。')
  if (await git(directory, 'branch', '--show-current') !== 'main') throw new Error('自动更新只处理 main 分支；当前分支保持不变。')
  if (await git(directory, 'status', '--porcelain', '--untracked-files=all')) throw new Error('存在未提交或未跟踪文件，已保留全部本地修改。请先提交或自行备份处理，再执行 update；仅启动请使用 run。')
  await git(directory, 'fetch', '--no-tags', 'origin', 'main')
  const before = await git(directory, 'rev-parse', 'HEAD'), next = await git(directory, 'rev-parse', 'FETCH_HEAD')
  if (before === next) { console.log('已经是最新版本。'); return }
  try { await git(directory, 'merge-base', '--is-ancestor', before, next) }
  catch { throw new Error('本地提交与远端无法快进更新，请先手动处理 Git 分支；未修改本地文件。') }
  const { exportSiteBackup } = await import(pathToFileURL(join(directory, 'scripts/site-backup.mjs')).href)
  const backup = await exportSiteBackup(directory)
  const backups = `${directory}-backups`
  await mkdir(backups, { recursive: true })
  const backupFile = join(backups, `${new Date().toISOString().replace(/[:.]/g, '-')}-${before.slice(0, 8)}-${randomUUID().slice(0, 8)}.devos.gz`)
  await writeFile(backupFile, Buffer.from(backup.content, 'base64'), { flag: 'wx', mode: 0o600 })
  console.log(`更新前备份：${backupFile}`)
  await git(directory, 'merge', '--ff-only', 'FETCH_HEAD')
  console.log(`更新完成：${before.slice(0, 8)} → ${next.slice(0, 8)}`)
}

export async function installDependencies(directory) {
  const lock = await readFile(join(directory, 'package-lock.json'))
  const fingerprint = createHash('sha256').update(lock).update(await readFile(join(directory, 'package.json'))).update(`${process.version}/${process.platform}/${process.arch}`).digest('hex')
  const stamp = join(directory, 'node_modules', '.devos-deploy-lock')
  const previous = await readFile(stamp, 'utf8').catch(() => '')
  if (previous === fingerprint && existsSync(join(directory, 'node_modules/vite/bin/vite.js'))) return
  console.log('安装锁定版本的依赖…')
  // Only constant npm arguments enter cmd.exe on Windows; paths are passed via cwd.
  await execute(windows ? 'npm.cmd' : 'npm', ['ci', '--include=dev', '--no-audit', '--no-fund'], { cwd: directory, visible: true, shell: windows })
  await writeFile(stamp, fingerprint)
}

export async function assertPortsFree(ports = [5173, 4174]) {
  for (const port of ports) await new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', () => reject(new Error(`127.0.0.1:${port} 已被占用。请先停止已有前台/Admin，再重新执行；不会关闭其他进程或更换端口。`)))
    server.listen(port, '127.0.0.1', () => server.close(resolvePort))
  })
}

export async function runServices(directory, { frontendPort = 5173, adminPort = 4174, openBrowser = true } = {}) {
  await assertPortsFree([frontendPort, adminPort])
  const frontend = `http://127.0.0.1:${frontendPort}/#/`, admin = `http://127.0.0.1:${adminPort}/admin/`
  const children = [], exits = []
  let stopping = false, finish
  const done = new Promise(resolveDone => { finish = resolveDone })
  async function stop(code = 0) {
    if (stopping) return
    stopping = true
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    const timer = setTimeout(() => { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') }, 3000)
    await Promise.all(exits)
    clearTimeout(timer)
    finish(code)
  }
  const interrupt = () => { void stop(0) }
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt)
  try {
    for (const [name, args, extra] of [
      ['前台', [join(directory, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort', '--base', '/'], { BASE_URL: '/' }],
      ['Admin', [join(directory, 'scripts/admin-server.mjs')], { ADMIN_PORT: String(adminPort) }],
    ]) {
      const child = spawn(process.execPath, args, { cwd: directory, stdio: 'inherit', env: { ...process.env, ...extra } })
      children.push(child)
      exits.push(new Promise(resolveExit => {
        child.once('error', error => { console.error(`${name} 启动失败：${error.message}`); resolveExit(); void stop(1) })
        child.once('exit', code => { resolveExit(); if (!stopping) { console.error(`${name} 已退出 (${code})，正在停止另一服务。`); void stop(1) } })
      }))
    }
    let ready = false
    const deadline = Date.now() + 30000
    while (!stopping && Date.now() < deadline) {
      ready = (await Promise.all([frontend, admin].map(url => fetch(url, { signal: globalThis.AbortSignal.timeout(500) }).then(response => { void response.body?.cancel(); return response.ok }).catch(() => false)))).every(Boolean)
      if (ready) break
      await delay(150)
    }
    if (!ready && !stopping) { console.error('服务启动超时，请检查上方输出。'); await stop(1) }
    if (ready && !stopping) {
      console.log(`\n前台：${frontend}\nAdmin：${admin}\n保持此终端运行，按 Ctrl+C 同时停止两个服务。`)
      if (openBrowser) {
        const command = process.platform === 'darwin' ? 'open' : windows ? 'rundll32' : 'xdg-open'
        const child = spawn(command, windows ? ['url.dll,FileProtocolHandler', frontend] : [frontend], { stdio: 'ignore' })
        child.on('error', () => console.log(`请在浏览器打开 ${frontend}`)); child.unref()
      }
    }
    return await done
  } finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); await stop(1) }
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { dir: { type: 'string' }, repo: { type: 'string' }, 'no-open': { type: 'boolean' }, 'no-start': { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } })
  if (values.help) {
    console.log(`DevOS 本地一键部署（Node.js 22+、npm、Git）\n\nnode deploy.mjs [run|update] [--dir 安装目录] [--repo 仓库URL] [--no-open] [--no-start]\n\nrun     安装缺失的项目/依赖并启动，保留本地改动，不拉取更新。\nupdate  首次下载或快进更新 main，备份内容后启动；拒绝覆盖本地修改。\n\n项目内默认 run；单独下载的 deploy.mjs 默认 update，安装到 ~/DevOS。\n--no-open 不自动打开浏览器；--no-start 仅准备项目，不启动服务。\n更新前先按 Ctrl+C 停止服务；本地内容请先提交或自行备份处理。`)
    return
  }
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('请先安装 Node.js 22 或更高版本（含 npm）。')
  const inProject = existsSync(join(scriptDirectory, 'scripts/admin-server.mjs'))
  const command = positionals[0] || (inProject ? 'run' : 'update')
  if (!['run', 'update'].includes(command) || positionals.length > 1) throw new Error('命令仅支持 run 或 update；使用 --help 查看用法。')
  const directory = resolve(values.dir || (inProject ? scriptDirectory : join(homedir(), 'DevOS')))
  await execute('git', ['--version']).catch(() => { throw new Error('未找到 Git，请安装 Git 后重新执行。') })
  await execute(windows ? 'npm.cmd' : 'npm', ['--version'], { shell: windows }).catch(() => { throw new Error('未找到 npm，请安装含 npm 的 Node.js 22+。') })
  if (!values['no-start']) await assertPortsFree()
  await prepareProject({ directory, repository: values.repo || DEFAULT_REPOSITORY, update: command === 'update' })
  await installDependencies(directory)
  await execute(process.execPath, [join(directory, 'scripts/validate-data.mjs')], { cwd: directory, visible: true })
  for (const utility of ['zip', 'unzip']) {
    await execute(utility, ['-v']).catch(() => console.log(`未找到 ${utility}；现有 ZIP 工具导入/导出需要此命令，其余功能可使用。`))
  }
  if (values['no-start']) { console.log(`准备完成：${directory}`); return }
  process.exitCode = await runServices(directory, { openBrowser: !values['no-open'] })
}

// macOS temporary directories and symlinked launchers may have a different lexical path.
if (process.argv[1] && await realpath(process.argv[1]).catch(() => '') === await realpath(fileURLToPath(import.meta.url))) {
  main().catch(error => { console.error(`部署未完成：${error.message}`); process.exitCode = 1 })
}
