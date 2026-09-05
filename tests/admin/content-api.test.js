// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { Buffer } from 'node:buffer'

const source = fileURLToPath(new URL('../../', import.meta.url))
let root, server, origin
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'admin-content-api-'))
  for (const path of ['scripts', 'shared', 'src/data', 'public/cfgs', 'public/tools', 'src/tools/manifests/core.json', 'public/tools-manifests.json', 'src/tools/registry.ts', 'package.json']) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await cp(join(source, path), join(root, path), { recursive: true }).catch(async error => {
      if (error.code !== 'ENOENT' || path !== 'public/cfgs') throw error
      await mkdir(join(root, path), { recursive: true })
    })
  }
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

it('keeps only three recoverable backup previews and accepts a newly selected backup immediately', async () => {
  const backup = await api('backup')
  expect(backup.status).toBe(200)
  const previews = []
  for (let index = 0; index < 4; index++) {
    const result = await api('backup/preview', 'POST', { content: backup.data.content })
    expect(result.status).toBe(200); previews.push(result.data)
  }
  expect((await readdir(root)).filter(name => name.startsWith('.admin-restore-'))).toHaveLength(3)
  expect((await api('backup/restore', 'POST', { token: previews[0].token })).status).toBe(400)
  expect((await api('backup/restore', 'POST', { token: previews[3].token })).status).toBe(200)
  expect((await api('validate')).data.ok).toBe(true)
})
