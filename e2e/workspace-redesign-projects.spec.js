import { test, expect } from '@playwright/test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'

const cfg = { id: '11111111-1111-4111-8111-111111111111', name: '社区配置', filename: 'community.cfg', description: '', category: '社区服', tags: [], updated: '2026-09-05', order: 10 }
const project = { id: 'community', name: '社区服务档案', kind: 'service', description: 'CS2 服务、配置与排障记录。', body: '# 服务说明\n\n只维护公开资源。\n\n<script>window.unsafeProject=1</script>', repository: 'https://example.com/repo', docs: 'https://example.com/docs', url: 'https://example.com/server', status: 'active', tags: ['CS2', '运维'], cfgIds: [cfg.id], enabled: true, order: 10, updated: '2026-09-05' }
const other = { ...project, id: 'assistant', name: '开发助手', kind: 'project', description: 'AI 开发流程。', tags: ['AI'], cfgIds: [], status: 'paused', order: 1 }
const note = { id: 'server-recovery', title: '社区服恢复步骤', summary: '服务异常时的检查顺序。', body: '# 社区服恢复步骤\n\n## 检查\n\n确认服务进程。', kind: 'incident', projectId: project.id, cfgIds: [cfg.id], tags: ['运维'], enabled: true, order: 10, updated: '2026-09-05' }
async function mockData(context, name, value) {
  await context.route(`**/src/data/${name}.json*`, route => route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify(value)}` }))
}

test.beforeEach(async ({ context }) => {
  await mockData(context, 'projects', [project, other, { ...other, id: 'hidden', name: '未公开项目', enabled: false }])
  await mockData(context, 'notes', [note])
  await mockData(context, 'cfgs', [cfg])
  await context.route(`**/cfgs/${cfg.id}.cfg`, route => route.fulfill({ contentType: 'text/plain', body: 'echo community\n' }))
})

test('项目筛选、置顶、详情关联及返回列表保持一致', async ({ page }, testInfo) => {
  await page.goto('/#/projects')
  await expect(page.locator('.project-card')).toHaveCount(2)
  await expect(page.locator('.project-card').first()).toContainText(other.name)
  await page.getByRole('button', { name: `置顶 ${project.name}`, exact: true }).click()
  await expect(page.locator('.project-card').first()).toContainText(project.name)
  await page.reload()
  await expect(page.locator('.project-card').first()).toContainText(project.name)
  await page.getByLabel('搜索桌面工具').fill('CS2')
  await expect(page).toHaveURL(/q=CS2/)
  await expect(page.locator('.project-card')).toHaveCount(1)
  await page.getByRole('link', { name: '查看详情', exact: true }).click()
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '代码仓库', exact: true })).toHaveAttribute('href', project.repository)
  await expect(page.getByRole('link', { name: /社区服恢复步骤/ })).toHaveAttribute('href', `#/notes/${note.id}`)
  await expect(page.getByRole('link', { name: /社区配置/ })).toHaveAttribute('href', `#/cfg/${cfg.id}`)
  expect(await page.evaluate(() => window.unsafeProject)).toBeUndefined()
  await page.getByRole('link', { name: '← 桌面工具库', exact: true }).click()
  await expect(page.getByLabel('搜索桌面工具')).toHaveValue('CS2')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.route-stage')).toHaveCSS('opacity', '1')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('projects-mobile.png'), fullPage: true })
  await page.getByLabel('搜索桌面工具').fill('nothing-123')
  await expect(page.getByRole('heading', { name: '没有匹配的工具或项目' })).toBeVisible()
  await page.getByRole('button', { name: '清除筛选' }).click()
  await expect(page.locator('.project-card')).toHaveCount(2)
  await page.goto('/#/projects/hidden')
  await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible()
})

test('置顶写失败有反馈，命令面板可搜索桌面工具', async ({ page }) => {
  await page.addInitScript(() => {
    const write = window.Storage.prototype.setItem
    window.Storage.prototype.setItem = function(key, value) { if (key === 'devos.projects.pinned' && !window.allowPinWrites) throw new Error('Quota exceeded'); return write.call(this, key, value) }
  })
  await page.goto('/#/projects')
  await page.getByRole('button', { name: `置顶 ${project.name}`, exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('仅本次会话有效')
  await page.evaluate(() => { window.allowPinWrites = true })
  await page.getByRole('button', { name: '重试保存置顶' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('devos.projects.pinned')))).toEqual([project.id])
  await page.getByRole('button', { name: '打开命令面板', exact: true }).click()
  await page.getByRole('combobox', { name: '命令面板搜索' }).fill(project.name)
  await page.getByRole('option', { name: new RegExp(project.name) }).click()
  await expect(page).toHaveURL(new RegExp(`#/projects/${project.id}$`))
})

test('运维手册支持类型项目筛选、关联跳转和 Markdown 下载', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/#/notes')
  await page.getByLabel('手册类型', { exact: true }).selectOption('incident')
  await page.getByLabel('笔记关联项目').selectOption(project.id)
  await page.reload()
  await expect(page.getByLabel('手册类型', { exact: true })).toHaveValue('incident')
  await expect(page.locator('.note-card')).toHaveCount(1)
  await page.locator('.note-card').click()
  await expect(page.getByRole('navigation', { name: '手册关联资料' })).toContainText(project.name)
  await page.getByRole('button', { name: '复制 Markdown' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(note.body)
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载手册' }).click()
  const file = await downloaded
  expect(file.suggestedFilename()).toBe(`${note.id}.md`)
  expect(await readFile(await file.path(), 'utf8')).toBe(note.body)
  await page.getByRole('link', { name: '← 全部笔记', exact: true }).click()
  await expect(page.getByLabel('笔记关联项目')).toHaveValue(project.id)
  await page.getByLabel('手册类型', { exact: true }).selectOption('rollback')
  await expect(page.getByRole('heading', { name: '没有匹配的手册' })).toBeVisible()
})

test('导航遵循分类权重，收藏语言标签参与筛选与全局搜索', async ({ page, context }) => {
  await mockData(context, 'categories', [{ id: 'dev', name: '开发', icon: 'Code2', order: 100 }, { id: 'ops', name: '运维优先', icon: 'Server', order: 0 }])
  await mockData(context, 'navigation', [{ id: 'dev', name: '开发网站', category: 'dev', url: 'https://example.com', description: '', tags: [], icon: 'letter', enabled: true, order: 1 }, { id: 'ops', name: '运维网站', category: 'ops', url: 'https://example.com', description: '', tags: [], icon: 'letter', enabled: true, order: 1 }])
  await mockData(context, 'library', [{ id: 'rust-kit', name: '示例资源', kind: 'repo', url: 'https://example.com', description: '可复用组件', language: 'Rust', tags: ['部署'], enabled: true, order: 1 }])
  await page.goto('/#/nav')
  await expect(page.locator('.category h3').first()).toHaveText('运维优先')
  await page.goto('/#/library')
  await page.getByLabel('收藏语言').selectOption('Rust')
  await page.getByLabel('收藏标签').selectOption('部署')
  await page.reload()
  await expect(page.getByLabel('收藏语言')).toHaveValue('Rust')
  await expect(page.locator('.library-labels')).toContainText('Rust')
  await page.getByRole('button', { name: '打开命令面板', exact: true }).click()
  await page.getByRole('combobox', { name: '命令面板搜索' }).fill('Rust')
  await expect(page.getByRole('option', { name: /示例资源/ })).toBeVisible()
})

test('桌面工具展示发布信息、下载原文件并可复制校验值', async ({ page, context }, testInfo) => {
  const bytes = Buffer.from('MZ desktop tool fixture\r\n')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const desktop = { ...project, id: `e2e-desktop-${randomUUID()}`, name: 'ModLink 3.5 Flow', kind: 'desktop', description: '用于 CS2 社区服模型处理的桌面工具。', body: '## 工具说明\n\n下载后在 Windows 中使用。', version: '3.5 Flow', platform: 'windows-x64', download: { filename: 'ModLink-3.5-Flow.exe', size: bytes.length, sha256 } }
  await mockData(context, 'projects', [desktop, { ...desktop, id: 'private', enabled: false }])
  const fixtureDir = path.resolve('public/downloads', desktop.id)
  await mkdir(fixtureDir, { recursive: true })
  await writeFile(path.join(fixtureDir, `${sha256}.exe`), bytes)
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/#/projects')
    await expect(page.getByRole('heading', { name: '桌面工具库', exact: true })).toBeVisible()
    await expect(page.locator('.project-card')).toHaveCount(1)
    await expect(page.locator('.project-card')).toHaveClass(/project-card-featured/)
    await expect(page.locator('.project-release')).toContainText('Windows x64')
    await expect(page.locator('.project-release')).toContainText('3.5 Flow')
    await expect(page.locator('.project-release')).toContainText(`${bytes.length} B`)
    await expect(page.getByRole('link', { name: `下载 ${desktop.download.filename}`, exact: true })).toHaveAttribute('href', `/downloads/${desktop.id}/${sha256}.exe`)
    await expect(page.getByRole('link', { name: `下载 ${desktop.download.filename}`, exact: true })).toHaveAttribute('download', desktop.download.filename)
    await page.getByLabel('项目类型').selectOption('desktop')
    await page.getByLabel('搜索桌面工具').fill('ModLink-3.5-Flow.exe')
    await expect(page.locator('.project-card')).toHaveCount(1)
    await page.screenshot({ path: testInfo.outputPath('desktop-library.png'), fullPage: true })
    await page.getByRole('link', { name: '查看详情', exact: true }).click()
    await expect(page.locator('.project-checksum code')).toHaveText(sha256)
    await page.getByRole('button', { name: '复制 SHA256' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(sha256)
    await expect(page.locator('.project-checksum').getByRole('status')).toHaveText('已复制')
    const downloading = page.waitForEvent('download')
    await page.getByRole('link', { name: `下载 ${desktop.download.filename}`, exact: true }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toBe(desktop.download.filename)
    expect(await readFile(await download.path())).toEqual(bytes)
    await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('clipboard unavailable')) })
    await page.getByRole('button', { name: '复制 SHA256' }).click()
    await expect(page.locator('.project-checksum').getByRole('alert')).toHaveText('复制失败，请手动选择结果复制')
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('.route-stage')).toHaveCSS('opacity', '1')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: testInfo.outputPath('desktop-detail-mobile.png'), fullPage: true })
    await page.getByRole('link', { name: '← 桌面工具库', exact: true }).click()
    await expect(page.getByLabel('项目类型')).toHaveValue('desktop')
    await expect(page.getByLabel('搜索桌面工具')).toHaveValue(desktop.download.filename)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('.route-stage')).toHaveCSS('opacity', '1')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: testInfo.outputPath('desktop-library-mobile.png'), fullPage: true })
  } finally { await rm(fixtureDir, { recursive: true, force: true }) }
})

test('未上传文件的桌面工具展示说明但不生成下载入口', async ({ page, context }) => {
  await mockData(context, 'projects', [{ ...other, kind: 'desktop', version: '1.0', platform: 'windows-arm64' }])
  await page.goto('/#/projects')
  await expect(page.locator('.project-release')).toContainText('暂未上传 EXE 文件')
  await expect(page.locator('.project-release')).toContainText('Windows ARM64')
  await expect(page.locator('a[download]')).toHaveCount(0)
  await page.getByRole('link', { name: '查看详情', exact: true }).click()
  await expect(page.locator('a[download]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '复制 SHA256' })).toHaveCount(0)
})
