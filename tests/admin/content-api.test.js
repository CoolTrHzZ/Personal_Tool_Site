// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'

const source = fileURLToPath(new URL('../../', import.meta.url))
const fixturePrefix = `tag-api-${randomUUID().slice(0, 8)}`
const fixtureKeys = ['navigation', 'ai-resources', 'library', 'notes', 'projects', 'ai-workflows', 'cfgs']
const fixtureIds = Object.fromEntries(fixtureKeys.map(key => [key, key === 'cfgs' ? randomUUID() : `${fixturePrefix}-${key}`]))
const coreFixtureId = `${fixturePrefix}-core`, staticFixtureId = `${fixturePrefix}-static`
let root, server, origin
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'admin-content-api-'))
  for (const path of ['scripts', 'shared', 'src/data', 'public/cfgs', 'public/downloads', 'public/tools', 'src/tools/manifests/core.json', 'public/tools-manifests.json', 'src/tools/registry.ts', 'package.json']) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await cp(join(source, path), join(root, path), { recursive: true }).catch(async error => {
      if (error.code !== 'ENOENT' || !['public/cfgs', 'public/downloads'].includes(path)) throw error
      await mkdir(join(root, path), { recursive: true })
    })
  }
  // Append dedicated fixtures in this temporary copy; personal collections may all be empty.
  const append = async (path, item) => {
    const items = JSON.parse(await readFile(path, 'utf8'))
    await writeFile(path, JSON.stringify([...items, item], null, 2) + '\n')
  }
  const bytes = Buffer.alloc(1024)
  bytes.write('MZ'); bytes.writeUInt32LE(128, 60); bytes.writeUInt32LE(0x4550, 128)
  bytes.writeUInt16LE(0x8664, 132); bytes.writeUInt16LE(1, 134); bytes.writeUInt16LE(240, 148); bytes.writeUInt16LE(2, 150)
  bytes.writeUInt16LE(0x20b, 152); bytes.writeUInt16LE(3, 220); bytes.writeUInt32LE(512, 408); bytes.writeUInt32LE(512, 412)
  const download = { filename: 'tag-fixture.exe', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  await mkdir(join(root, 'public/downloads', fixtureIds.projects), { recursive: true })
  await writeFile(join(root, 'public/downloads', fixtureIds.projects, `${download.sha256}.exe`), bytes)
  await mkdir(join(root, 'public/cfgs'), { recursive: true })
  await writeFile(join(root, 'public/cfgs', `${fixtureIds.cfgs}.cfg`), '\ufeff// 标签测试\r\nbind F6 say \u0006颜色\u0007文本\u000b保留\u000e社区\u0010服\r\n')
  const common = { name: '标签测试资源', description: '', tags: [], enabled: true, order: 1, updated: '2026-09-08' }
  await append(join(root, 'src/data/categories.json'), { id: `${fixturePrefix}-category`, name: '测试分类', icon: 'Code2', order: 1 })
  const fixtureData = {
    navigation: { ...common, url: 'https://example.com/tag-fixture', category: `${fixturePrefix}-category`, icon: 'letter' },
    'ai-resources': { ...common, kind: 'prompt', install: '', content: '标签测试提示词', url: '' },
    library: { ...common, kind: 'repo', url: 'https://example.com/tag-fixture', language: 'JavaScript' },
    notes: { title: '标签测试手册', summary: '', body: '# 标签测试', kind: 'note', projectId: fixtureIds.projects, cfgIds: [fixtureIds.cfgs], tags: [], enabled: true, order: 1, updated: common.updated },
    projects: project({ kind: 'desktop', download, platform: 'windows-x64', cfgIds: [fixtureIds.cfgs] }),
    'ai-workflows': workflow({ steps: [{ title: '测试步骤', description: '', resourceId: fixtureIds['ai-resources'] }] }),
    cfgs: { name: '标签测试 CFG', filename: 'tag-fixture.cfg', description: '', category: '测试', tags: [], order: 1, updated: common.updated, version: 1, changelog: '', history: [] },
  }
  for (const key of fixtureKeys) await append(join(root, 'src/data', `${key}.json`), { ...fixtureData[key], id: fixtureIds[key] })
  const manifest = { name: '标签测试工具', description: '', category: 'development', version: '1.0.0', enabled: true, order: 1, keywords: [], tags: [], status: 'active', author: 'test', updated: common.updated, readme: '标签测试工具', license: 'MIT' }
  await append(join(root, 'src/tools/manifests/core.json'), { ...manifest, id: coreFixtureId, type: 'react', entry: 'react' })
  await appendFile(join(root, 'src/tools/registry.ts'), `\nexport const tagApiFixture = { id: '${coreFixtureId}', path: '/tools/${coreFixtureId}' }\n`)
  await mkdir(join(root, 'public/tools', staticFixtureId), { recursive: true })
  await writeFile(join(root, 'public/tools', staticFixtureId, 'manifest.json'), JSON.stringify({ ...manifest, id: staticFixtureId, type: 'html', runtime: 'static', entry: 'index.html' }))
  await writeFile(join(root, 'public/tools', staticFixtureId, 'index.html'), '<!doctype html><title>Tag fixture</title>')
  server = spawn(process.execPath, [join(root, 'scripts/admin-server.mjs')], { cwd: root, env: { ...process.env, ADMIN_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
  origin = await new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error(`Admin 启动超时：${output}`)), 8000)
    server.on('error', error => { clearTimeout(timeout); reject(error) })
    server.on('exit', code => { clearTimeout(timeout); reject(new Error(`Admin 提前退出 ${code}：${output}`)) })
    server.stderr.on('data', chunk => { output += chunk })
    server.stdout.on('data', chunk => {
      output += chunk
      const match = output.match(/Admin: (http:\/\/127\.0\.0\.1:\d+)\/admin/)
      if (match) { clearTimeout(timeout); resolve(match[1]) }
    })
  })
}, 15000)
afterAll(async () => {
  if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); await stopped }
  if (root) await rm(root, { recursive: true, force: true })
})
const api = async (path, method = 'GET', payload, headers = {}) => {
  const response = await fetch(`${origin}/api/${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}) })
  return { status: response.status, data: await response.json() }
}
const project = extra => ({ id: 'api-project', name: 'API 项目', description: '临时服务项目', kind: 'service', status: 'active', repository: '', docs: '', url: 'https://example.com', body: '部署说明', tags: ['集成测试'], cfgIds: [], enabled: true, order: 10, updated: '2026-09-05', ...extra })
const workflow = extra => ({ id: 'api-workflow', name: 'API 工作流', description: '临时工作流', category: 'incident', tags: [], steps: [{ title: '收集证据', description: '保留日志与时间线', resourceId: '' }], enabled: true, order: 10, updated: '2026-09-05', ...extra })

it('persists project CRUD and note relations, rejects dangling references and keeps referenced projects', async () => {
  expect((await api('projects', 'POST', project())).status).toBe(201)
  expect((await api('projects')).data).toEqual(expect.arrayContaining([project()]))
  const note = { id: 'api-runbook', title: 'API 部署记录', summary: '用于验证关联', body: '# 发布记录\n\n完成检查。', kind: 'deploy', projectId: 'api-project', cfgIds: [], tags: [], enabled: true, order: 10, updated: '2026-09-05' }
  expect((await api('notes', 'POST', { ...note, id: 'api-broken-note', projectId: 'does-not-exist' })).status).toBe(400)
  expect((await api('notes', 'POST', note)).status).toBe(201)
  expect((await api('projects/api-project', 'PUT', { status: 'paused', body: '下一次发布暂停' })).status).toBe(200)
  expect((await api('projects/api-project', 'PUT', { id: 'changed-id' })).status).toBe(400)
  expect((await api('projects/api-project', 'DELETE')).status).toBe(409)
  const records = JSON.parse(await readFile(join(root, 'src/data/projects.json'), 'utf8'))
  expect(records.find(item => item.id === 'api-project')).toMatchObject({ status: 'paused', body: '下一次发布暂停' })
  expect((await api('notes/api-runbook', 'PUT', { projectId: '' })).status).toBe(200)
  expect((await api('projects/api-project', 'DELETE')).status).toBe(200)
  expect((await api('notes/api-runbook', 'DELETE')).status).toBe(200)
  expect((await api('projects')).data.some(item => item.id === 'api-project')).toBe(false)
})

it('validates workflow fields and resource references and protects resources until workflows release them', async () => {
  const resource = { id: 'api-evidence-prompt', kind: 'prompt', name: '证据提示词', description: '测试条目', content: '解释这些日志', url: '', install: '', tags: [], order: 10, enabled: true, updated: '2026-09-05' }
  expect((await api('ai-resources', 'POST', resource)).status).toBe(201)
  const before = await readFile(join(root, 'src/data/ai-workflows.json'), 'utf8')
  for (const patch of [{ category: 'invalid' }, { steps: [] }, { steps: [{ title: '错误引用', description: '', resourceId: 'unknown-resource' }] }, { updated: '2026-02-30' }]) {
    expect((await api('ai-workflows', 'POST', workflow(patch))).status).toBe(400)
    expect(await readFile(join(root, 'src/data/ai-workflows.json'), 'utf8')).toBe(before)
  }
  const valid = workflow({ steps: [{ title: '收集证据', description: '按资源提示词整理', resourceId: resource.id }] })
  expect((await api('ai-workflows', 'POST', valid)).status).toBe(201)
  expect((await api('ai-workflows')).data).toEqual(expect.arrayContaining([valid]))
  expect((await api(`ai-resources/${resource.id}`, 'DELETE')).status).toBe(409)
  expect((await api('ai-workflows/api-workflow', 'PUT', { name: '工作流更新', steps: workflow().steps })).status).toBe(200)
  expect((await api(`ai-resources/${resource.id}`, 'DELETE')).status).toBe(200)
  expect((await api('ai-workflows/api-workflow', 'DELETE')).status).toBe(200)
})

it('serves historic CFG bytes, rolls back as a new version and protects linked CFGs until unlinking', async () => {
  const original = '\ufeff// API 字节保留\r\nbind "SPACE" "+jump"\r\nbind F6 say \u0006颜色\u0007文本\u000b保留\u000e社区\u0010服\r\n'
  const payload = { filename: 'api-original.cfg', content: original, name: 'API CFG', description: '', category: '日常', tags: [], order: 10, changelog: '初始版本' }
  const first = await api('cfgs', 'POST', payload)
  expect(first.status).toBe(201)
  const id = first.data.id
  for (const patch of [{ filename: 'color\u0006.cfg' }, { name: 'color\u0007' }, { tags: ['color\u000b'] }, { content: 'echo \u0000binary' }]) expect((await api(`cfgs/${id}`, 'PUT', { ...payload, ...patch })).status).toBe(400)
  expect((await api(`cfgs/${id}`)).data).toMatchObject({ version: 1, content: original })
  const changed = await api(`cfgs/${id}`, 'PUT', { ...payload, filename: 'api-updated.cfg', content: 'bind "SPACE" "+duck"\nbind F7 say \u0001新版本\n', changelog: '调整跳跃' })
  expect(changed.status).toBe(200)
  expect(changed.data.version).toBe(2)
  const old = changed.data.history[0]
  expect((await api(`cfgs/${id}/versions/${old.id}`)).data).toMatchObject({ version: 1, filename: payload.filename, content: original, changelog: payload.changelog })
  const historic = await fetch(`${origin}/cfgs/${id}.${old.id}.cfg`)
  expect(historic.status).toBe(200)
  expect(Buffer.from(await historic.arrayBuffer())).toEqual(Buffer.from(original))
  expect((await api(`cfgs/${id}/rollback`, 'POST', { revisionId: old.id })).data).toMatchObject({ version: 3, filename: payload.filename, changelog: '回滚至 v1' })
  expect((await api(`cfgs/${id}`)).data.content).toBe(original)
  expect(Buffer.from(await (await fetch(`${origin}/cfgs/${id}.cfg`)).arrayBuffer())).toEqual(Buffer.from(original))
  const invalidRevision = '11111111-1111-4111-8111-111111111111'
  expect((await api(`cfgs/${id}/versions/${invalidRevision}`)).status).toBe(404)
  expect((await fetch(`${origin}/cfgs/${id}.${invalidRevision}.cfg`)).status).toBe(404)
  expect((await api(`cfgs/${id}/rollback`, 'POST', { revisionId: invalidRevision })).status).toBe(404)
  expect((await api('projects', 'POST', project({ id: 'api-cfg-project', cfgIds: [id] }))).status).toBe(201)
  expect((await api(`cfgs/${id}`, 'DELETE')).status).toBe(409)
  expect((await api('projects/api-cfg-project', 'DELETE')).status).toBe(200)
  expect((await api(`cfgs/${id}`, 'DELETE')).status).toBe(200)
  expect((await fetch(`${origin}/cfgs/${id}.${old.id}.cfg`)).status).toBe(404)
})

it('rejects cross-origin writes before changing project data', async () => {
  const before = await readFile(join(root, 'src/data/projects.json'), 'utf8')
  expect((await api('projects', 'POST', project({ id: 'api-forbidden' }), { Origin: 'https://example.com' })).status).toBe(403)
  expect(await readFile(join(root, 'src/data/projects.json'), 'utf8')).toBe(before)
})

it('aggregates, merges and deletes tags across every collection without changing CFG or EXE files', async () => {
  const sourceTag = `${fixturePrefix}-old`, targetTag = `${fixturePrefix}-merged`
  const chosen = []
  for (const key of fixtureKeys) {
    const item = (await api(key)).data.find(item => item.id === fixtureIds[key])
    expect(item, key).toBeTruthy()
    expect((await api(`${key}/${item.id}`, 'PUT', { ...item, tags: [...item.tags, sourceTag, targetTag] })).status, key).toBe(200)
    chosen.push([key, item.id])
  }
  const tools = (await api('tools')).data
  const core = tools.find(item => item.id === coreFixtureId)
  const staticTool = tools.find(item => item.id === staticFixtureId)
  for (const item of [core, staticTool]) {
    expect(item).toBeTruthy()
    expect((await api(`tools/${item.id}`, 'PUT', { tags: [...(item.tags || []), sourceTag, targetTag], keywords: [...(item.keywords || []), sourceTag] })).status).toBe(200)
  }
  expect((await api('tags', 'POST', { name: sourceTag })).status).toBe(201)
  const usage = (await api('tags')).data.items.find(item => item.name === sourceTag)
  expect(usage).toMatchObject({ total: 9, navigationCount: 1, toolCount: 2, aiResourceCount: 1, libraryCount: 1, noteCount: 1, projectCount: 1, aiWorkflowCount: 1, cfgCount: 1, catalog: true })
  expect(usage.sources.map(item => item.type)).toEqual(expect.arrayContaining(['catalog', 'navigation', 'tool', 'ai-resource', 'library', 'note', 'project', 'ai-workflow', 'cfg']))
  expect((await api('tags/rename', 'POST', { from: sourceTag, to: 'invalid\u0085tag' })).status).toBe(400)
  expect((await api('tags')).data.items.find(item => item.name === sourceTag)).toEqual(usage)
  const cfg = (await api('cfgs')).data.find(item => item.id === fixtureIds.cfgs)
  const originalCfg = await readFile(join(root, 'public/cfgs', `${cfg.id}.cfg`))
  const projects = (await api('projects')).data
  const desktop = projects.find(item => item.id === fixtureIds.projects)
  const exePath = join(root, 'public/downloads', desktop.id, `${desktop.download.sha256}.exe`)
  const exe = await readFile(exePath)
  const renamed = await api('tags/rename', 'POST', { from: sourceTag, to: targetTag })
  expect(renamed.status).toBe(200)
  expect(renamed.data).toMatchObject({ affected: 9, navigation: 1, tools: 2, aiResources: 1, library: 1, notes: 1, projects: 1, aiWorkflows: 1, cfgs: 1 })
  for (const [key, id] of chosen) {
    const item = (await api(key)).data.find(item => item.id === id)
    expect(item.tags).not.toContain(sourceTag)
    expect(item.tags.filter(tag => tag === targetTag)).toHaveLength(1)
  }
  expect((await api('tags')).data.items.some(item => item.name === sourceTag)).toBe(false)
  expect((await api(`tags/${targetTag}`, 'DELETE')).status).toBe(200)
  expect((await api('tags')).data.items.some(item => item.name === targetTag)).toBe(false)
  const updatedCfg = (await api('cfgs')).data.find(item => item.id === cfg.id)
  expect({ ...updatedCfg, tags: cfg.tags }).toEqual(cfg)
  expect(await readFile(join(root, 'public/cfgs', `${cfg.id}.cfg`))).toEqual(originalCfg)
  expect((await api('projects')).data.find(item => item.id === desktop.id).download).toEqual(desktop.download)
  expect((await readFile(exePath)).equals(exe)).toBe(true)
  expect((await api('validate')).data.ok).toBe(true)
})

it('rolls back global tag edits when a later metadata file cannot be written', async () => {
  const tag = `${fixturePrefix}-rollback`
  for (const key of ['navigation', 'projects']) {
    const item = (await api(key)).data.find(item => item.id === fixtureIds[key])
    expect((await api(`${key}/${item.id}`, 'PUT', { ...item, tags: [...item.tags, tag] })).status).toBe(200)
  }
  expect((await api('tags', 'POST', { name: tag })).status).toBe(201)
  const paths = ['tags', 'navigation', 'projects'].map(key => join(root, 'src/data', `${key}.json`))
  const before = await Promise.all(paths.map(path => readFile(path)))
  const obstruction = join(root, 'src/data/projects.json.tmp')
  await mkdir(obstruction)
  try {
    const result = await api('tags/rename', 'POST', { from: tag, to: 'audit-new-tag' })
    expect(result.status).toBe(400)
    expect(await Promise.all(paths.map(path => readFile(path)))).toEqual(before)
    expect((await api('tags')).data.items.find(item => item.name === tag)).toMatchObject({ navigationCount: 1, projectCount: 1, catalog: true })
  } finally { await rm(obstruction, { recursive: true, force: true }) }
})

it('keeps only three recoverable backup previews and accepts a newly selected backup immediately', async () => {
  const backup = await api('backup')
  expect(backup.status).toBe(200)
  const previews = []
  for (let index = 0; index < 4; index++) {
    const result = await api('backup/preview', 'POST', { content: backup.data.content })
    expect(result.status, JSON.stringify(result.data)).toBe(200); previews.push(result.data)
  }
  expect((await readdir(root)).filter(name => name.startsWith('.admin-restore-'))).toHaveLength(3)
  expect((await api('backup/restore', 'POST', { token: previews[0].token })).status).toBe(400)
  expect((await api('backup/restore', 'POST', { token: previews[3].token })).status).toBe(200)
  expect((await api('validate')).data.ok).toBe(true)
})
