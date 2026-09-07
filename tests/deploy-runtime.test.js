// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installDependencies, assertPortsFree } from '../deploy.mjs'

const roots = [], supervisors = [], servers = []
afterEach(async () => {
  for (const child of supervisors.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    const exited = once(child, 'exit')
    child.kill('SIGTERM')
    const timer = setTimeout(() => child.kill('SIGKILL'), 4000)
    await exited
    clearTimeout(timer)
  }
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
  for (const root of roots.splice(0)) {
    for (const name of ['frontend', 'admin']) {
      const pid = Number(await readFile(join(root, `${name}.pid`), 'utf8').catch(() => ''))
      if (pid) { try { process.kill(pid, 'SIGKILL') } catch { /* Fixture already stopped. */ } }
    }
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'deploy runtime '))
  roots.push(root)
  return root
}

async function dependencyFixture() {
  const root = await fixture()
  await mkdir(join(root, 'fixture-vite/bin'), { recursive: true })
  await writeFile(join(root, 'fixture-vite/package.json'), JSON.stringify({ name: 'vite', version: '0.0.0', type: 'module' }))
  await writeFile(join(root, 'fixture-vite/bin/vite.js'), '// Offline dependency fixture.\n')
  const manifest = { name: 'deploy-runtime-fixture', version: '1.0.0', private: true, devDependencies: { vite: 'file:./fixture-vite' } }
  await writeFile(join(root, 'package.json'), JSON.stringify(manifest))
  // A local file dependency keeps real npm ci entirely offline.
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({
    name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true,
    packages: {
      '': manifest,
      'fixture-vite': { name: 'vite', version: '0.0.0', dev: true },
      'node_modules/vite': { resolved: 'fixture-vite', link: true },
    },
  }))
  return root
}

it('installs dependencies once, reuses the matching lock, and reinstalls after the lock changes', async () => {
  const root = await dependencyFixture(), stamp = join(root, 'node_modules/.devos-deploy-lock')
  await installDependencies(root)
  const first = await readFile(stamp, 'utf8')
  expect(first).toMatch(/^[a-f0-9]{64}$/)
  expect(await readFile(join(root, 'node_modules/vite/bin/vite.js'), 'utf8')).toContain('Offline dependency')
  const sentinel = join(root, 'node_modules/cache-sentinel')
  await writeFile(sentinel, 'keep when cached')
  await installDependencies(root)
  expect(await readFile(sentinel, 'utf8')).toBe('keep when cached')
  await appendFile(join(root, 'package-lock.json'), '\n')
  await installDependencies(root)
  expect(await readFile(stamp, 'utf8')).not.toBe(first)
  await expect(readFile(sentinel)).rejects.toMatchObject({ code: 'ENOENT' })
}, 20000)

it('does not mark a failed dependency install as complete and succeeds on retry', async () => {
  const root = await dependencyFixture(), path = join(root, 'package.json')
  const manifest = JSON.parse(await readFile(path, 'utf8'))
  await writeFile(path, JSON.stringify({ ...manifest, scripts: { preinstall: 'node -e "process.exit(7)"' } }))
  await expect(installDependencies(root)).rejects.toThrow('执行失败')
  await expect(readFile(join(root, 'node_modules/.devos-deploy-lock'))).rejects.toMatchObject({ code: 'ENOENT' })
  await writeFile(path, JSON.stringify(manifest))
  await installDependencies(root)
  expect(await readFile(join(root, 'node_modules/.devos-deploy-lock'), 'utf8')).toMatch(/^[a-f0-9]{64}$/)
}, 15000)

async function listeningServer() {
  const server = createServer((_, response) => response.end('existing service'))
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server
}

it('rejects an occupied port without interrupting its existing service', async () => {
  const server = await listeningServer(), port = server.address().port
  await expect(assertPortsFree([port])).rejects.toThrow(`127.0.0.1:${port} 已被占用`)
  expect(server.listening).toBe(true)
  expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe('existing service')
})

async function startSupervisor({ failAdmin = false } = {}) {
  const root = await fixture()
  // Hold both ephemeral ports until selected so they cannot be allocated twice.
  const sockets = await Promise.all([listeningServer(), listeningServer()])
  const [frontendPort, adminPort] = sockets.map(server => server.address().port)
  for (const server of sockets) await new Promise(resolve => server.close(resolve))
  const source = `
    import { createServer } from 'node:http'
    import { existsSync, writeFileSync } from 'node:fs'
    const admin = Boolean(process.env.ADMIN_PORT), name = admin ? 'admin' : 'frontend'
    writeFileSync(name + '.pid', String(process.pid))
    if (admin && ${failAdmin}) {
      const timer = setInterval(() => { if (existsSync('frontend.ready')) { clearInterval(timer); process.exit(14) } }, 10)
    } else {
      const port = admin ? Number(process.env.ADMIN_PORT) : Number(process.argv[process.argv.indexOf('--port') + 1])
      const server = createServer((_, response) => response.end(name))
      server.listen(port, '127.0.0.1', () => writeFileSync(name + '.ready', 'ready'))
      process.on('SIGTERM', () => {
        writeFileSync(name + '.stopped', 'SIGTERM')
        server.close(() => process.exit(0))
        server.closeAllConnections()
      })
    }
  `
  await mkdir(join(root, 'node_modules/vite/bin'), { recursive: true })
  await mkdir(join(root, 'scripts'))
  await writeFile(join(root, 'package.json'), '{"type":"module"}')
  await writeFile(join(root, 'node_modules/vite/package.json'), '{"type":"module"}')
  await writeFile(join(root, 'node_modules/vite/bin/vite.js'), source)
  await writeFile(join(root, 'scripts/admin-server.mjs'), source)
  await writeFile(join(root, 'supervisor.mjs'), `import { runServices } from ${JSON.stringify(new URL('../deploy.mjs', import.meta.url).href)}; process.exitCode = await runServices(${JSON.stringify(root)}, ${JSON.stringify({ frontendPort, adminPort, openBrowser: false })});`)
  const child = spawn(process.execPath, [join(root, 'supervisor.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  supervisors.push(child)
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  const exited = once(child, 'exit')
  return { root, child, exited, frontendPort, adminPort, output: () => output }
}

it('starts both local services and SIGTERM stops the supervisor and both children', async () => {
  const run = await startSupervisor()
  await expect.poll(run.output, { timeout: 6000 }).toContain('按 Ctrl+C 同时停止两个服务')
  for (const [name, port] of [['frontend', run.frontendPort], ['admin', run.adminPort]]) {
    expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe(name)
  }
  run.child.kill('SIGTERM')
  expect(await run.exited).toEqual([0, null])
  for (const name of ['frontend', 'admin']) {
    expect(await readFile(join(run.root, `${name}.stopped`), 'utf8')).toBe('SIGTERM')
    const pid = Number(await readFile(join(run.root, `${name}.pid`), 'utf8'))
    expect(() => process.kill(pid, 0)).toThrow()
  }
  await expect(assertPortsFree([run.frontendPort, run.adminPort])).resolves.toBeUndefined()
}, 10000)

it('stops the other service and exits unsuccessfully when one service fails during startup', async () => {
  const run = await startSupervisor({ failAdmin: true })
  expect(await run.exited).toEqual([1, null])
  expect(run.output()).toContain('Admin 已退出 (14)')
  expect(run.output()).not.toContain('按 Ctrl+C 同时停止两个服务')
  expect(await readFile(join(run.root, 'frontend.stopped'), 'utf8')).toBe('SIGTERM')
  for (const name of ['frontend', 'admin']) {
    const pid = Number(await readFile(join(run.root, `${name}.pid`), 'utf8'))
    expect(() => process.kill(pid, 0)).toThrow()
  }
  await expect(assertPortsFree([run.frontendPort, run.adminPort])).resolves.toBeUndefined()
}, 10000)
