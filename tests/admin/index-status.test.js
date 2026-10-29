// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// Import the real server module, but never bind a socket, read private files or
// execute a subprocess. Every filesystem operation uses synthetic memory only.
const fixture = vi.hoisted(() => ({ files: new Map(), failure: '', coreReads: 0, writes: 0, renames: 0 }))
vi.mock('node:http', () => ({
  createServer: vi.fn(listener => {
    fixture.listener = listener
    fixture.server = {
      listen: vi.fn((_port, _host, ready) => { ready(); return fixture.server }),
      address: () => ({ port: 4174 }),
    }
    fixture.created()
    return fixture.server
  }),
}))
vi.mock('node:child_process', () => ({
  execFile: vi.fn(() => { throw new Error('Unexpected subprocess') }),
  spawn: vi.fn(() => { throw new Error('Unexpected subprocess') }),
}))
vi.mock('node:fs', () => ({ existsSync: vi.fn(path => String(path).endsWith('/public/tools') || fixture.files.has(String(path))) }))
vi.mock('node:fs/promises', () => {
  const forbidden = name => vi.fn(() => { throw new Error(`Unexpected filesystem operation: ${name}`) })
  return {
    readFile: vi.fn(async path => {
      path = String(path)
      if (path.endsWith('/package.json')) return '{"version":"4.0.0"}'
      if (path.endsWith('/src/data/navigation.json')) { await fixture.navigationGate; return '[]' }
      if (path.endsWith('/src/data/categories.json')) return '[]'
      if (path.endsWith('/src/tools/manifests/core.json')) {
        fixture.coreReads++
        if (fixture.failure === 'read') throw fixture.error
        return JSON.stringify([{ id: 'synthetic-tool', name: 'Synthetic', type: 'react', entry: 'react', version: '1.0.0', enabled: true, order: 1 }])
      }
      if (fixture.files.has(path)) return fixture.files.get(path)
      throw new Error('Unexpected file read')
    }),
    readdir: vi.fn(async path => {
      if (String(path).endsWith('/public/tools')) return []
      throw new Error('Unexpected directory read')
    }),
    writeFile: vi.fn(async (path, value) => {
      if (!String(path).endsWith('/public/tools-manifests.json.tmp')) throw new Error('Unexpected write')
      fixture.writes++
      if (fixture.failure === 'write') throw fixture.error
      fixture.files.set(String(path), value)
    }),
    rename: vi.fn(async (from, to) => {
      if (!String(to).endsWith('/public/tools-manifests.json')) throw new Error('Unexpected rename')
      fixture.renames++
      fixture.renameStarted?.()
      await fixture.renameGate
      if (fixture.failure === 'rename') throw fixture.error
      fixture.files.set(String(to), fixture.files.get(String(from)))
      fixture.files.delete(String(from))
    }),
    rm: vi.fn(async path => {
      if (!String(path).endsWith('/public/tools/.staging')) throw new Error('Unexpected removal')
    }),
    // admin-maintain's direct-entry guard compares paths; do not inspect disk.
    realpath: vi.fn(async path => String(path)),
    mkdir: forbidden('mkdir'), mkdtemp: forbidden('mkdtemp'), copyFile: forbidden('copyFile'),
    stat: forbidden('stat'), lstat: forbidden('lstat'), cp: forbidden('cp'),
    appendFile: forbidden('appendFile'), open: forbidden('open'), rmdir: forbidden('rmdir'),
  }
})

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  fixture.files = new Map(); fixture.failure = ''; fixture.coreReads = 0; fixture.writes = 0; fixture.renames = 0
  fixture.navigationGate = undefined
  fixture.renameGate = undefined; fixture.renameStarted = undefined
  fixture.error = new Error('Synthetic failure: /synthetic-private/index.json <unsafe>')
  fixture.createdPromise = new Promise(resolve => { fixture.created = resolve })
  vi.stubEnv('ADMIN_MODE', 'local'); vi.stubEnv('ADMIN_PORT', '4174')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request') }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

function request(path = '/api/system', method = 'GET') {
  return new Promise(resolve => {
    const headers = {}
    const req = { url: path, method, headers: { host: '127.0.0.1:4174' }, socket: { localPort: 4174 } }
    const res = {
      setHeader: (name, value) => { headers[name] = value },
      writeHead: (status, extra) => { res.statusCode = status; Object.assign(headers, extra) },
      end: body => resolve({ status: res.statusCode, data: JSON.parse(body), headers }),
    }
    fixture.listener(req, res)
  })
}

it('reports failed after a startup rebuild failure while the Admin process remains available', async () => {
  fixture.failure = 'write'
  await import('../../scripts/admin-server.mjs')
  expect(fixture.server.listen).toHaveBeenCalledOnce()
  expect(fixture.writes).toBe(1)
  expect(console.error).toHaveBeenCalledWith('index rebuild failed:', fixture.error.message)
  const response = await request()
  console.info('Synthetic real-module startup/handler evidence:', JSON.stringify({ writes: fixture.writes, mockListenCalls: fixture.server.listen.mock.calls.length, status: response.status, response: response.data }))
  expect(response.status).toBe(200)
  expect(response.data).toEqual({ version: '4.0.0', mode: 'local', admin: 'running', runtime: 'ready', index: 'failed' })
})

const rebuildCalls = () => [fixture.coreReads, fixture.writes, fixture.renames]

it.each(['read', 'rename'])('records a %s failure without exposing its exception or retrying on status reads', async failure => {
  fixture.failure = failure
  await import('../../scripts/admin-server.mjs')
  const before = rebuildCalls()
  for (let i = 0; i < 3; i++) {
    const { status, data } = await request()
    expect(status).toBe(200)
    expect(data).toEqual({ version: '4.0.0', mode: 'local', admin: 'running', runtime: 'ready', index: 'failed' })
    expect(JSON.stringify(data)).not.toContain('synthetic-private')
  }
  expect(rebuildCalls()).toEqual(before)
  expect(fixture.coreReads).toBe(1)
  expect(fetch).not.toHaveBeenCalled()
})

it('reports synced only after a successful startup rebuild and keeps repeated reads side-effect free', async () => {
  await import('../../scripts/admin-server.mjs')
  expect(rebuildCalls()).toEqual([1, 1, 1])
  const index = [...fixture.files].find(([path]) => path.endsWith('/public/tools-manifests.json'))
  expect(JSON.parse(index[1]).map(item => item.id)).toEqual(['synthetic-tool'])
  for (let i = 0; i < 3; i++) expect((await request()).data.index).toBe('synced')
  expect(rebuildCalls()).toEqual([1, 1, 1])
  expect(fetch).not.toHaveBeenCalled()
})

it('reports unknown before any rebuild attempt without starting one on status reads', async () => {
  let resume
  fixture.navigationGate = new Promise(resolve => { resume = resolve })
  const loading = import('../../scripts/admin-server.mjs')
  try {
    await fixture.createdPromise
    // Direct callback invocation before fake listen; not a real HTTP request.
    for (let i = 0; i < 3; i++) expect((await request()).data.index).toBe('unknown')
    expect(rebuildCalls()).toEqual([0, 0, 0])
    expect(fixture.server.listen).not.toHaveBeenCalled()
  } finally { resume(); await loading }
  expect((await request()).data.index).toBe('synced')
})

it('does not announce a first rebuild as synced while its atomic replacement is still pending', async () => {
  let resume
  fixture.renameGate = new Promise(resolve => { resume = resolve })
  const entered = new Promise(resolve => { fixture.renameStarted = resolve })
  const loading = import('../../scripts/admin-server.mjs')
  try {
    await entered
    expect((await request()).data.index).toBe('unknown')
    expect([...fixture.files.keys()].some(path => path.endsWith('/public/tools-manifests.json'))).toBe(false)
  } finally { resume(); await loading }
  expect((await request()).data.index).toBe('synced')
  expect(rebuildCalls()).toEqual([1, 1, 1])
})

it('recovers a failed startup only when an existing explicit rebuild actually succeeds', async () => {
  fixture.failure = 'write'
  await import('../../scripts/admin-server.mjs')
  fixture.failure = ''
  expect((await request()).data.index).toBe('failed')
  expect(rebuildCalls()).toEqual([1, 1, 0])
  expect(await request('/api/tools/rebuild', 'POST')).toMatchObject({ status: 200, data: { count: 1 } })
  expect((await request()).data.index).toBe('synced')
  expect(rebuildCalls()).toEqual([2, 2, 1])
})

it('replaces a previous success with failure and preserves the existing rebuild error response', async () => {
  await import('../../scripts/admin-server.mjs')
  fixture.failure = 'rename'
  expect(await request('/api/tools/rebuild', 'POST')).toMatchObject({ status: 400, data: { error: fixture.error.message } })
  expect((await request()).data.index).toBe('failed')
  fixture.failure = ''
  expect((await request()).data.index).toBe('failed')
  expect(rebuildCalls()).toEqual([2, 2, 2])
  expect(await request('/api/tools/rebuild', 'POST')).toMatchObject({ status: 200, data: { count: 1 } })
  expect((await request()).data.index).toBe('synced')
  expect(rebuildCalls()).toEqual([3, 3, 3])
})
