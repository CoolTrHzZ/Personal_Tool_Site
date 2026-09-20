import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { Buffer } from 'node:buffer'
import { gzipSync } from 'node:zlib'

const tagOptions = [{ name: 'AI workflow', total: 1 }, { name: '社区服', total: 1 }, { name: '设计，排版', total: 1 }]
async function tagApi(route, url) { if (url.pathname !== '/api/tags') return false; await route.fulfill({ json: { items: tagOptions } }); return true }
async function selectTags(form, custom = '自定义') {
  const search = form.locator('.picker-search')
  await search.fill('awf'); await search.press('ArrowDown'); await form.locator('[data-tag-option="AI workflow"]').press('Enter')
  await expect(form.locator('[data-tag-option="AI workflow"]')).toBeFocused()
  await search.fill(custom); await search.press('Enter')
  await form.getByRole('button', { name: '移除标签 AI workflow', exact: true }).click()
  await expect(form.locator('[name="tags"]')).toHaveValue(custom)
}

async function mockAdmin(page, override) {
  const collections = {}
  for (const key of ['navigation', 'categories', 'site', 'library', 'ai-resources', 'notes', 'tags', 'projects', 'cfgs', 'ai-workflows']) collections[key] = JSON.parse(await readFile(resolve('src/data', `${key}.json`), 'utf8'))
  collections.projects = []; collections.notes = []; collections['ai-workflows'] = []; collections.cfgs = []
  collections.tools = JSON.parse(await readFile(resolve('public/tools-manifests.json'), 'utf8'))
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname !== 'admin.mock') return route.abort()
    if (url.pathname.startsWith('/api/')) {
      if (override && await override(route, url, collections)) return
      const [key, id] = url.pathname.slice(5).split('/'), method = route.request().method()
      const respond = value => route.fulfill({ json: value })
      if (key === 'system') return respond({ version: 'test', admin: 'running' })
      if (key === 'validate') return respond({ ok: true, issues: [] })
      if (key === 'tags') return respond({ items: [], navigationTagCount: 0, toolTagCount: 0, aiResourceTagCount: 0 })
      if (key === 'publishing') return respond({ git: true, branch: 'main', files: [{ path: 'src/data/projects.json', status: ' M', managed: true }], command: 'git diff --stat' })
      if (!(key in collections)) return route.fulfill({ status: 404, json: { error: `unmocked ${key}` } })
      if (method === 'GET') return respond(collections[key])
      const data = route.request().postDataJSON()
      if (key === 'site') collections.site = data
      else if (method === 'POST') collections[key].push(data)
      else if (method === 'PUT') collections[key] = collections[key].map(item => item.id === id ? { ...item, ...data } : item)
      return respond(data)
    }
    const target = resolve(`.${url.pathname === '/admin/' ? '/admin/index.html' : url.pathname}`)
    try { const body = await readFile(target); return route.fulfill({ body, contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(target)] || 'application/octet-stream' }) } catch { return route.fulfill({ status: 404, body: 'not found' }) }
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('http://admin.mock/admin/')
  await expect(page.locator('#stat-websites')).not.toHaveText('—')
  return { collections, errors }
}

test('Admin 首次新增自动填写 ID，保存失败保留输入并支持重试', async ({ page }) => {
  let fail = true
  const { collections, errors } = await mockAdmin(page, async (route, url) => {
    if (fail && url.pathname === '/api/navigation' && route.request().method() === 'POST') {
      await route.fulfill({ status: 500, json: { error: '暂时无法保存，请重试' } }); return true
    }
    return false
  })
  await page.locator('#dashboard-add-website').click()
  const form = page.locator('#nav-form')
  await form.locator('[name="name"]').fill('我的第一个网址')
  await form.locator('[name="url"]').fill('https://example.com')
  const id = await form.locator('[name="id"]').inputValue()
  expect(id).toMatch(/^item-[a-f0-9]{8}$/)
  await form.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(form.locator('.form-error')).toHaveText('暂时无法保存，请重试')
  await expect(form.locator('[name="url"]')).toHaveValue('https://example.com')
  await expect(form.locator('[name="id"]')).toHaveValue(id)
  fail = false
  await form.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(page.locator('#editor-drawer')).toBeHidden()
  expect(collections.navigation.find(item => item.id === id)).toMatchObject({ name: '我的第一个网址', url: 'https://example.com', enabled: true })
  expect(errors).toEqual([])
})

test('Admin 切换编辑条目不残留上一条的可选字段', async ({ page }) => {
  const records = [
    { id: 'with-language', name: 'First', kind: 'repo', url: 'https://example.com/first', description: 'First description', language: 'TypeScript', tags: [], order: 1, enabled: true },
    { id: 'without-language', name: 'Second', kind: 'repo', url: 'https://example.com/second', tags: [], order: 2, enabled: true },
  ]
  const { errors } = await mockAdmin(page, async (route, url) => {
    if (url.pathname !== '/api/library') return false
    await route.fulfill({ json: records }); return true
  })
  await page.locator('.nav-item[data-view="library"]').click()
  await page.locator('#library tr').first().locator('.kebab-toggle').click()
  await page.locator('.kebab-menu:not([hidden]) [data-edit-library]').click()
  await expect(page.locator('#library-form [name="language"]')).toHaveValue('TypeScript')
  await page.locator('#editor-drawer-close').click()
  await page.locator('#library tr').nth(1).locator('.kebab-toggle').click()
  await page.locator('.kebab-menu:not([hidden]) [data-edit-library]').click()
  await expect(page.locator('#library-form [name="language"]')).toHaveValue('')
  await expect(page.locator('#library-form [name="description"]')).toHaveValue('')
  expect(errors).toEqual([])
})

test('Admin 列表直达标签和说明，直接保存未确认标签且仅修改目标字段', async ({ page }) => {
  const records = {
    navigation: { id: 'quick-nav', name: 'Quick website', description: '', url: 'https://example.com', category: 'development', icon: 'auto', tags: ['原标签'], order: 10, enabled: true },
    library: { id: 'quick-library', name: 'Quick library', description: '原说明', kind: 'repo', url: 'https://example.com/repo', language: 'TypeScript', tags: ['原标签'], order: 20, enabled: false },
    'ai-resources': { id: 'quick-ai', name: 'Quick AI', description: '原说明', kind: 'prompt', content: '保留提示词', install: '保留安装方式', url: '', tags: ['原标签'], order: 30, enabled: true },
    notes: { id: 'quick-note', title: 'Quick note', summary: '原摘要', body: '# 保留正文', projectId: 'project', cfgIds: ['cfg'], tags: ['原标签'], order: 40, enabled: true, updated: '2026-09-01' },
  }
  const writes = []; let seeded = false
  const { collections, errors } = await mockAdmin(page, async (route, url, data) => {
    if (!seeded) { for (const [kind, record] of Object.entries(records)) data[kind] = [{ ...record }]; seeded = true }
    if (route.request().method() === 'PUT') writes.push({ path: url.pathname, body: route.request().postDataJSON() })
    return tagApi(route, url)
  })
  for (const [kind, original] of Object.entries(records)) {
    await page.locator(`.nav-item[data-view="${kind === 'navigation' ? 'websites' : kind}"]`).click()
    const shortcut = page.locator(`[data-metadata-kind="${kind}"][data-metadata-id="${original.id}"]`)
    await expect(shortcut).toHaveAccessibleName(`编辑 ${original.name || original.title} 的标签和说明`)
    await shortcut.click()
    const form = page.locator('#metadata-form'), key = kind === 'notes' ? 'summary' : 'description'
    await expect(form.locator(`[name="${key}"]`)).toBeFocused()
    await expect(page.locator('#editor-drawer-body form:visible')).toHaveCount(1)
    await form.locator(`[name="${key}"]`).fill(`  ${kind} 新说明  `)
    await form.locator('.picker-search').fill('直接保存的标签')
    await form.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect(page.locator('#editor-drawer')).toBeHidden()
    const patch = { [key]: `${kind} 新说明`, tags: ['原标签', '直接保存的标签'] }
    expect(writes.at(-1)).toEqual({ path: `/api/${kind}/${original.id}`, body: patch })
    expect(collections[kind][0]).toEqual({ ...original, ...patch })
    await expect(shortcut).toContainText(patch[key])
    await expect(shortcut).toBeFocused()
  }
  expect(writes).toHaveLength(4)
  expect(errors).toEqual([])
})

test('Admin 快捷编辑保存失败可恢复草稿重试，切换完整编辑不会叠加表单', async ({ page }) => {
  let fail = true
  const { collections, errors } = await mockAdmin(page, async (route, url) => {
    if (fail && url.pathname.startsWith('/api/navigation/') && route.request().method() === 'PUT') {
      await route.fulfill({ status: 500, json: { error: '说明暂时无法保存' } }); return true
    }
    return tagApi(route, url)
  })
  const original = { ...collections.navigation[0] }
  await page.locator('.nav-item[data-view="websites"]').click()
  const shortcut = page.locator(`[data-metadata-kind="navigation"][data-metadata-id="${original.id}"]`)
  await shortcut.click()
  const form = page.locator('#metadata-form')
  await form.locator('[name="description"]').fill('失败后仍保留的说明')
  await form.locator('.picker-search').fill('失败后保留标签')
  await form.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(form.locator('.form-error')).toHaveText('说明暂时无法保存')
  await expect(form.getByRole('button', { name: '保存修改', exact: true })).toBeEnabled()
  expect(collections.navigation[0]).toEqual(original)
  await form.locator('.picker-search').fill('尚未确认的草稿标签')
  page.once('dialog', dialog => dialog.accept())
  await page.locator('#editor-drawer-close').click()
  await shortcut.click()
  await form.getByRole('button', { name: '恢复草稿', exact: true }).click()
  await expect(form.locator('[name="description"]')).toHaveValue('失败后仍保留的说明')
  await expect(form.getByRole('button', { name: '移除标签 失败后保留标签', exact: true })).toBeVisible()
  await expect(form.locator('.picker-search')).toHaveValue('尚未确认的草稿标签')
  fail = false
  await form.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(page.locator('#editor-drawer')).toBeHidden()
  expect(collections.navigation[0]).toEqual({ ...original, description: '失败后仍保留的说明', tags: [...new Set([...(original.tags || []), '失败后保留标签', '尚未确认的草稿标签'])] })
  await shortcut.click()
  await expect(form.getByRole('button', { name: '恢复草稿', exact: true })).toHaveCount(0)
  // Sidebar routing can be triggered while a drawer exists; it must retire that form as well.
  await page.locator('.nav-item[data-view="library"]').evaluate(node => node.click())
  await expect(page.locator('#editor-drawer')).toBeHidden()
  await page.locator('#library .kebab-toggle').first().click()
  await page.locator('.kebab-menu:not([hidden]) [data-edit-library]').click()
  await expect(page.locator('#library-form')).toBeVisible()
  await expect(form).toBeHidden()
  await expect(page.locator('#editor-drawer-body form:visible')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('Admin 内置与导入工具快捷编辑合并标签和关键词，删除后仅更新元数据', async ({ page }) => {
  const records = ['react', 'static'].map(runtime => ({ id: `quick-${runtime}`, name: `Quick ${runtime}`, runtime, version: '1.0.0', description: '原工具说明', category: 'development', tags: ['保留标签', '重复标签'], keywords: ['仅关键词', '重复标签'], display: { mode: 'workspace', height: 640 }, permissions: { clipboardWrite: true }, readme: '# 保留完整说明', enabled: true, order: 12 }))
  const writes = []; let seeded = false
  const { collections, errors } = await mockAdmin(page, async (route, url, data) => {
    if (!seeded) { data.tools = records.map(record => ({ ...record })); seeded = true }
    if (route.request().method() === 'PUT' && url.pathname.startsWith('/api/tools/')) writes.push(route.request().postDataJSON())
    return tagApi(route, url)
  })
  await page.locator('.nav-item[data-view="tools"]').click()
  for (const original of records) {
    const shortcut = page.locator(`[data-metadata-kind="tools"][data-metadata-id="${original.id}"]`)
    await shortcut.click()
    const form = page.locator('#metadata-form')
    await expect(form.locator('[name="tags"]')).toHaveValue('保留标签, 重复标签, 仅关键词')
    await form.getByRole('button', { name: '移除标签 仅关键词', exact: true }).click()
    await form.getByRole('button', { name: '移除标签 重复标签', exact: true }).click()
    await form.locator('[name="description"]').fill('新的工具卡片说明')
    await form.locator('.picker-search').fill('新增工具标签')
    await form.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect(page.locator('#editor-drawer')).toBeHidden()
    const patch = { description: '新的工具卡片说明', tags: ['保留标签', '新增工具标签'], keywords: ['保留标签', '新增工具标签'] }
    expect(writes.at(-1)).toEqual(patch)
    expect(collections.tools.find(tool => tool.id === original.id)).toEqual({ ...original, ...patch })
    await expect(shortcut).toContainText(patch.description)
    await shortcut.click()
    await expect(form.locator('[name="tags"]')).toHaveValue('保留标签, 新增工具标签')
    await page.locator('#editor-drawer-close').click()
  }
  expect(writes).toHaveLength(2)
  expect(errors).toEqual([])
})

test('Admin 原始 JSON 保存失败保留编辑内容', async ({ page }) => {
  const { errors } = await mockAdmin(page, async (route, url) => {
    if (url.pathname !== '/api/notes' || route.request().method() !== 'POST') return false
    await route.fulfill({ status: 500, json: { error: '暂时无法保存笔记' } }); return true
  })
  await page.locator('.nav-item[data-view="notes"]').click()
  await page.locator('[data-add-note]').click()
  await page.locator('#note-studio-form [name="title"]').fill('保留 JSON')
  await page.locator('[data-note-tab="json"]').click()
  const json = await page.locator('#note-json').inputValue()
  await page.locator('#note-save').click()
  await expect(page.locator('#note-studio-form .form-error')).toHaveText('暂时无法保存笔记')
  await expect(page.locator('#note-json')).toHaveValue(json)
  expect(errors).toEqual([])
})

test('Admin 笔记恢复 JSON 草稿保留原文，兼容没有编辑模式的旧版非法 JSON 草稿', async ({ page }) => {
  const { collections, errors } = await mockAdmin(page)
  for (const legacy of [false, true]) {
    await page.locator('.nav-item[data-view="notes"]').click()
    await page.locator('[data-add-note]').click()
    const form = page.locator('#note-studio-form')
    await form.locator('[name="title"]').fill(legacy ? '旧版草稿恢复' : 'JSON 草稿恢复')
    await page.locator('[data-note-tab="json"]').click()
    const content = JSON.parse(await page.locator('#note-json').inputValue())
    content.body = '# 仅在原始 JSON 中修改的正文'
    const raw = legacy ? '{"body":"尚未写完的 JSON' : JSON.stringify(content)
    await page.locator('#note-json').fill(raw)
    page.once('dialog', dialog => dialog.accept())
    await page.locator('.nav-item[data-view="notes"]').click()
    if (legacy) await page.evaluate(() => {
      const key = 'devos-admin-draft:note-studio-form:new'
      const draft = JSON.parse(localStorage.getItem(key))
      delete draft.extra.tab
      localStorage.setItem(key, JSON.stringify(draft))
    })
    await page.locator('[data-add-note]').click()
    await form.getByRole('button', { name: '恢复草稿', exact: true }).click()
    await expect(page.locator('#note-tab-json')).toBeVisible()
    await expect(form.locator('.note-meta')).toBeHidden()
    await expect(page.locator('#note-json')).toHaveValue(raw)
    await page.locator('[data-note-tab="json"]').click()
    await expect(page.locator('#note-json')).toHaveValue(raw)
    await page.locator('[data-note-tab="write"]').click()
    if (legacy) {
      await expect(page.locator('#note-tab-json')).toBeVisible()
      await expect(page.locator('#note-json')).toHaveValue(raw)
      await page.locator('#note-json').fill(JSON.stringify(content))
      await page.locator('[data-note-tab="write"]').click()
    }
    await expect(page.locator('#note-body')).toHaveValue(content.body)
    await page.locator('#note-save').click()
    await expect(page.locator('[data-view-panel="notes"]')).toHaveClass(/active/)
    expect(collections.notes.at(-1)).toMatchObject({ id: content.id, body: content.body })
  }
  expect(errors).toEqual([])
})

test('Admin 新网站与新收藏分别保留草稿，恢复时不会套入另一种表单', async ({ page }) => {
  const { errors } = await mockAdmin(page)
  const forms = [
    { view: 'websites', create: '[data-add-website]', form: '#nav-form', name: '未保存的网站', url: 'https://example.com/site' },
    { view: 'library', create: '[data-add-library]', form: '#library-form', name: '未保存的收藏', url: 'https://github.com/example/repo' },
  ]
  for (const item of forms) {
    await page.locator(`.nav-item[data-view="${item.view}"]`).click()
    await page.locator(item.create).click()
    const form = page.locator(item.form)
    await expect(form.getByRole('button', { name: '恢复草稿', exact: true })).toHaveCount(0)
    await form.locator('[name="name"]').fill(item.name)
    await form.locator('[name="url"]').fill(item.url)
    page.once('dialog', dialog => dialog.accept())
    await page.locator('#editor-drawer-close').click()
  }
  for (const item of forms) {
    await page.locator(`.nav-item[data-view="${item.view}"]`).click()
    await page.locator(item.create).click()
    const form = page.locator(item.form)
    await form.getByRole('button', { name: '恢复草稿', exact: true }).click()
    await expect(form.locator('[name="name"]')).toHaveValue(item.name)
    await expect(form.locator('[name="url"]')).toHaveValue(item.url)
    page.once('dialog', dialog => dialog.accept())
    await page.locator('#editor-drawer-close').click()
  }
  expect(errors).toEqual([])
})

test('Admin 项目、工作流与运维笔记表单联动，草稿与固定 ID 保持正确', async ({ page }) => {
  const { collections, errors } = await mockAdmin(page)
  await page.locator('.nav-item[data-view="projects"]').click()
  await page.getByRole('button', { name: '新增桌面工具' }).click()
  const form = page.locator('#content-collection-form')
  await form.locator('[name="id"]').fill('demo-project')
  await form.locator('[name="name"]').fill('联调项目')
  await form.locator('[name="body"]').fill('# 项目说明')
  page.once('dialog', dialog => dialog.dismiss())
  await page.locator('#editor-drawer-close').click()
  await expect(form).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.locator('#editor-drawer-close').click()
  await page.getByRole('button', { name: '新增桌面工具' }).click()
  await form.getByRole('button', { name: '恢复草稿' }).click()
  await expect(form.locator('[name="body"]')).toHaveValue('# 项目说明')
  await form.getByRole('button', { name: '保存到项目', exact: true }).click()
  await expect(page.locator('#editor-drawer')).toBeHidden()
  await page.locator('.admin-collection-row').getByRole('button', { name: '编辑', exact: true }).click()
  await expect(form.locator('[name="id"]')).toHaveAttribute('readonly', '')
  await page.locator('#editor-drawer-close').click()
  expect(collections.projects).toHaveLength(1)

  await page.locator('.nav-item[data-view="notes"]').click()
  await page.locator('[data-add-note]').click()
  const note = page.locator('#note-studio-form')
  await note.locator('[name="id"]').fill('deploy-demo')
  await note.locator('[name="title"]').fill('部署流程')
  await note.locator('[name="projectId"]').selectOption('demo-project')
  await note.locator('[name="kind"]').selectOption('deploy')
  await note.locator('[name="body"]').fill('')
  await page.locator('#note-template').click()
  await expect(note.locator('[name="body"]')).toHaveValue(/## 部署步骤/)
  await page.locator('#note-save').click()
  await expect(page.locator('[data-view-panel="notes"]')).toHaveClass(/active/)
  expect(collections.notes[0]).toMatchObject({ kind: 'deploy', projectId: 'demo-project', cfgIds: [] })

  await page.locator('.nav-item[data-view="ai-workflows"]').click()
  await page.getByRole('button', { name: '新增AI 工作流' }).click()
  await form.locator('[name="id"]').fill('review-flow')
  await form.locator('[name="name"]').fill('代码审查流程')
  await form.locator('[name="steps"]').fill('bad JSON')
  await form.getByRole('button', { name: '保存到项目', exact: true }).click()
  await expect(form.locator('[role="alert"]')).not.toBeEmpty()
  await form.locator('[name="steps"]').fill(JSON.stringify([{ title: '确认范围', description: '阅读上下文', resourceId: '' }]))
  await page.locator('#editor-drawer-body').evaluate(node => { node.scrollTop = 0 })
  await page.screenshot({ path: 'e2e/screenshots/admin-content-workflow-desktop.png' })
  await form.getByRole('button', { name: '保存到项目', exact: true }).click()
  await expect(page.locator('#editor-drawer')).toBeHidden()
  expect(collections['ai-workflows']).toHaveLength(1)
  expect(errors).toEqual([])
})

test('Admin 新内容编辑与发布清单在手机屏幕内可操作', async ({ page }) => {
  const { errors } = await mockAdmin(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('#admin-menu').click()
  await page.locator('.nav-item[data-view="projects"]').click()
  await page.getByRole('button', { name: '新增桌面工具' }).click()
  await expect(page.locator('#content-collection-form [name="id"]')).toBeFocused()
  const form = page.locator('#content-collection-form')
  await expect(form.locator('.admin-draft')).toContainText('修改后将自动保存浏览器草稿')
  await expect(form.locator(':scope > .ui-modal-actions')).toBeInViewport()
  await expect(form.locator('[name="body"]')).toHaveCSS('padding-top', '10px')
  expect(await form.locator('[name="id"]').evaluate(node => window.getComputedStyle(node.closest('.ui-field').querySelector('.ui-field-label'), '::after').content)).toContain('*')
  await form.getByRole('button', { name: '保存到项目', exact: true }).click()
  const danger = await page.evaluate(() => { const sample = document.body.appendChild(document.createElement('span')); sample.style.color = 'var(--danger)'; const color = window.getComputedStyle(sample).color; sample.remove(); return color })
  await expect(form.locator('[name="id"]')).toHaveCSS('border-color', danger)
  const dialog = await page.locator('.editor-modal').boundingBox(); expect(dialog.x).toBeGreaterThanOrEqual(0); expect(dialog.x + dialog.width).toBeLessThanOrEqual(391)
  await page.screenshot({ path: 'e2e/screenshots/admin-content-project-mobile.png' })
  await page.locator('#editor-drawer-close').click()
  await page.locator('#admin-menu').click()
  await page.locator('.nav-item[data-view="settings"]').click()
  await page.locator('[data-settings-tab="deploy"]').click()
  await expect(page.locator('.admin-file-list')).toContainText('src/data/projects.json')
  await expect.poll(() => page.locator('#admin-sidebar').evaluate(node => node.getBoundingClientRect().right)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'e2e/screenshots/admin-publishing-mobile.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('Admin 完整备份传输、校验错误、恢复确认与失败重试可用', async ({ page }) => {
  const archive = gzipSync(Buffer.from('backup transport fixture'))
  let previews = 0, restores = 0, uploaded
  const { errors } = await mockAdmin(page, async (route, url) => {
    if (url.pathname === '/api/backup') { await route.fulfill({ json: { filename: 'site.devos.gz', content: archive.toString('base64'), files: 18 } }); return true }
    if (url.pathname === '/api/backup/preview') {
      previews++; uploaded = route.request().postDataJSON()
      await route.fulfill(previews === 1 ? { status: 400, json: { error: '备份内容校验未通过' } } : { json: { token: 'preview-token', files: 18, changes: [{ action: 'replace', path: 'src/data/projects.json' }, { action: 'delete', path: 'public/cfgs/old.cfg' }] } })
      return true
    }
    if (url.pathname === '/api/backup/restore') {
      expect(route.request().postDataJSON()).toEqual({ token: 'preview-token' })
      restores++
      await route.fulfill(restores === 1 ? { status: 400, json: { error: '磁盘写入失败，原有内容已回滚' } } : { json: { ok: true, files: 18 } })
      return true
    }
    if (url.pathname === '/api/publishing/validate') { await route.fulfill({ json: { ok: true, issues: [] } }); return true }
    return false
  })
  await page.locator('.nav-item[data-view="settings"]').click()
  await page.locator('[data-settings-tab="backup"]').click()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出完整站点备份', exact: true }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('site.devos.gz')
  expect(await readFile(await download.path())).toEqual(archive)
  const input = page.getByLabel('选择完整站点备份', { exact: true })
  const file = { name: 'site.devos.gz', mimeType: 'application/gzip', buffer: archive }
  await input.setInputFiles(file)
  await expect(page.locator('.admin-management-result')).toContainText('备份内容校验未通过')
  await expect(input).toHaveValue('')
  await input.setInputFiles(file)
  await expect(page.locator('.admin-management-result')).toContainText('恢复预览 · 18 个文件')
  expect(Buffer.from(uploaded.content, 'base64')).toEqual(archive)
  await expect(page.locator('.admin-file-list')).toContainText('删除 · public/cfgs/old.cfg')
  const restore = page.getByRole('button', { name: '确认恢复完整备份', exact: true })
  await restore.click()
  await page.locator('#modal-cancel').click()
  expect(restores).toBe(0)
  await restore.click()
  await page.locator('#modal-ok').click()
  await expect(page.locator('.toast').filter({ hasText: '原有内容已回滚' })).toBeVisible()
  await expect(restore).toBeEnabled()
  await restore.click()
  await page.locator('#modal-ok').click()
  await expect(page.locator('.toast').filter({ hasText: '站点已恢复' })).toBeVisible()
  expect(restores).toBe(2)
  await page.locator('[data-settings-tab="deploy"]').click()
  await page.getByRole('button', { name: '运行发布前校验', exact: true }).click()
  await expect(page.locator('.admin-management-result')).toContainText('发布前校验通过')
  expect(errors).toEqual([])
})


test('Admin 延迟初始聚焦不会抢走已输入字段、确认按钮或已关闭弹窗之外的焦点', async ({ page }) => {
  const { errors } = await mockAdmin(page)
  await page.locator('.nav-item[data-view="websites"]').click()
  const initialStatus = await page.evaluate(() => {
    const original = window.requestAnimationFrame, callbacks = []
    window.requestAnimationFrame = callback => { callbacks.push(callback); return callbacks.length }
    document.querySelector('[data-add-website]').click()
    const status = document.querySelector('#nav-form .admin-draft').textContent
    const url = document.querySelector('#nav-form [name="url"]')
    url.focus(); url.value = 'https://example.com'; url.dispatchEvent(new Event('input', { bubbles: true }))
    window.requestAnimationFrame = original
    callbacks.forEach(callback => callback(window.performance.now()))
    return status
  })
  const form = page.locator('#nav-form')
  expect(initialStatus).toContain('修改后将自动保存浏览器草稿')
  expect(initialStatus).not.toContain('所有修改已保存')
  await expect(form.locator('[name="url"]')).toBeFocused()
  await page.keyboard.press('End')
  await page.keyboard.insertText('/continued')
  await expect(form.locator('[name="url"]')).toHaveValue('https://example.com/continued')
  await expect(form.locator('[name="name"]')).toHaveValue('')
  page.once('dialog', dialog => dialog.accept())
  await page.locator('#editor-drawer-close').click()

  await page.locator('#navigation .kebab-toggle').first().click()
  await page.evaluate(() => {
    const original = window.requestAnimationFrame, callbacks = []
    window.requestAnimationFrame = callback => { callbacks.push(callback); return callbacks.length }
    document.querySelector('.kebab-menu [data-delete]').click()
    document.querySelector('#modal-ok').focus()
    window.requestAnimationFrame = original
    callbacks.forEach(callback => callback(window.performance.now()))
  })
  await expect(page.locator('#modal-ok')).toBeFocused()
  await page.locator('#modal-cancel').click()

  await page.evaluate(() => {
    const original = window.requestAnimationFrame, callbacks = []
    window.requestAnimationFrame = callback => { callbacks.push(callback); return callbacks.length }
    document.querySelector('[data-add-website]').click()
    document.querySelector('#editor-drawer-close').click()
    document.querySelector('#website-query').focus()
    window.requestAnimationFrame = original
    callbacks.forEach(callback => callback(window.performance.now()))
  })
  await expect(page.locator('#editor-drawer')).toBeHidden()
  await expect(page.locator('#website-query')).toBeFocused()
  expect(errors).toEqual([])
})

test('Admin 全部内容标签支持候选、自定义与草稿恢复，笔记 JSON 与选择保持同步', async ({ page }) => {
  const { collections, errors } = await mockAdmin(page, tagApi)
  for (const [view, create, id] of [
    ['websites', '[data-add-website]', '#nav-form'], ['library', '[data-add-library]', '#library-form'],
    ['ai-resources', '[data-add-ai-resource]', '#ai-resource-form'], ['cfg-library', '#cfg-add', '#cfg-form'],
    ['projects', '[data-view-panel="projects"] .ui-button-primary', '#content-collection-form'],
    ['ai-workflows', '[data-view-panel="ai-workflows"] .ui-button-primary', '#content-collection-form'],
  ]) {
    await page.locator(`.nav-item[data-view="${view}"]`).click(); await page.locator(create).click()
    const form = page.locator(id)
    await selectTags(form)
    page.once('dialog', dialog => dialog.accept()); await page.locator('#editor-drawer-close').click()
    await page.locator(create).click(); await form.getByRole('button', { name: '恢复草稿', exact: true }).click()
    await expect(form.getByRole('button', { name: '移除标签 自定义', exact: true })).toBeVisible()
    if (view === 'cfg-library') {
      await form.locator('[data-tag-option="设计，排版"]').click()
      await form.locator('#cfg-file').setInputFiles({ name: 'tags.cfg', mimeType: 'text/plain', buffer: Buffer.from('echo tags') })
      await form.locator('#cfg-save').click()
      await expect(page.locator('#editor-drawer')).toBeHidden()
      expect(collections.cfgs[0].tags).toEqual(['自定义', '设计，排版'])
      continue
    }
    page.once('dialog', dialog => dialog.accept()); await page.locator('#editor-drawer-close').click()
  }
  await page.locator('.nav-item[data-view="notes"]').click(); await page.locator('[data-add-note]').click()
  const note = page.locator('#note-studio-form')
  await selectTags(note, '笔记标签')
  await note.locator('[name="title"]').fill('标签同步笔记'); await note.locator('[name="id"]').fill('tag-sync')
  await note.locator('.picker-search').fill('x'.repeat(65)); await note.locator('.picker-search').press('Enter'); await page.locator('#note-save').click()
  expect(collections.notes).toHaveLength(0); await expect(note.locator('.picker-search')).toBeFocused()
  await note.locator('.picker-search').fill('')
  expect(JSON.parse(await page.locator('#note-json').inputValue()).tags).toEqual(['笔记标签'])
  await note.locator('.picker-search').fill('切换前未确认标签')
  await page.locator('[data-note-tab="json"]').click()
  expect(JSON.parse(await page.locator('#note-json').inputValue()).tags).toEqual(['笔记标签', '切换前未确认标签'])
  await page.locator('#note-json').fill('{'); await page.locator('[data-note-tab="write"]').click()
  await expect(page.locator('#note-json')).toBeFocused(); await expect(page.locator('#note-tab-json')).toBeVisible()
  const content = JSON.parse(JSON.stringify(collections.notes[0] || { id: 'tag-sync', kind: 'note', enabled: true })); content.title = 'JSON 切换笔记'; content.tags = ['JSON 标签']
  await page.locator('#note-json').fill(JSON.stringify(content)); await page.locator('[data-note-tab="write"]').click()
  await expect(note.locator('[name="title"]')).toHaveValue('JSON 切换笔记')
  await expect(note.getByRole('button', { name: '移除标签 JSON 标签', exact: true })).toBeVisible()
  await page.locator('[data-note-tab="json"]').click()
  await expect(note.locator('.note-meta')).toBeHidden()
  const jsonDraft = JSON.parse(await page.locator('#note-json').inputValue())
  jsonDraft.body = '# 原始 JSON 中刚编辑的正文'
  await page.locator('#note-json').fill(JSON.stringify(jsonDraft))
  await page.locator('[data-note-tab="write"]').click()
  await expect(note.locator('.note-meta')).toBeVisible()
  await expect(note.locator('[name="body"]')).toHaveValue(jsonDraft.body)
  await note.locator('.picker-search').fill('JSON 返回后未确认标签')
  await page.locator('#note-save').click(); expect(collections.notes[0]).toMatchObject({ title: 'JSON 切换笔记', body: jsonDraft.body, tags: ['JSON 标签', 'JSON 返回后未确认标签'] })
  await expect(page.locator('[data-view-panel="notes"]')).toHaveClass(/active/)
  await page.locator('#notes .kebab-toggle').first().click(); await page.locator('[data-edit-note="tag-sync"]').click()
  await expect(note.getByRole('button', { name: '移除标签 JSON 标签', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('Admin 仅改变图标或分类也会保护并恢复草稿，隐藏身份字段不改变', async ({ page }) => {
  const { errors } = await mockAdmin(page, tagApi)
  await page.locator('.nav-item[data-view="websites"]').click(); await page.locator('#navigation .kebab-toggle').first().click()
  await page.locator('.kebab-menu:not([hidden]) [data-edit]').click()
  const form = page.locator('#nav-form'), id = await form.locator('[name="originalId"]').inputValue()
  const category = await form.locator('[data-category-option][aria-pressed="false"]').first().getAttribute('data-category-option')
  await form.locator(`[data-category-option="${category}"]`).focus(); await page.keyboard.press('Enter')
  await expect(form.locator(`[data-category-option="${category}"]`)).toBeFocused()
  await form.locator('details.form-advanced > summary').click()
  await form.locator('[data-icon-option="letter"]').focus(); await page.keyboard.press('Enter')
  await expect(form.locator('[data-icon-option="letter"]')).toBeFocused()
  page.once('dialog', dialog => dialog.dismiss()); await page.locator('#editor-drawer-close').click(); await expect(form).toBeVisible()
  page.once('dialog', dialog => dialog.accept()); await page.locator('#editor-drawer-close').click()
  await page.locator('#navigation .kebab-toggle').first().click(); await page.locator('.kebab-menu:not([hidden]) [data-edit]').click()
  await form.getByRole('button', { name: '恢复草稿', exact: true }).click()
  await expect(form.locator(`[data-category-option="${category}"]`)).toHaveAttribute('aria-pressed', 'true')
  await expect(form.locator('[data-icon-option="letter"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(form.locator('[name="originalId"]')).toHaveValue(id)
  expect(errors).toEqual([])
})

test('Admin 工具编辑与导入向导共享标签选择，手机页面不溢出', async ({ page }) => {
  const writes = []
  const { errors } = await mockAdmin(page, async (route, url) => {
    if (await tagApi(route, url)) return true
    if (url.pathname === '/api/tools') { await route.fulfill({ json: [{ id: 'static-demo', name: 'Static Demo', runtime: 'static', version: '1.0.0', category: 'development', tags: [], permissions: {} }] }); return true }
    if (url.pathname === '/api/tools/static-demo' && route.request().method() === 'PUT') { writes.push(route.request().postDataJSON()); await route.fulfill({ json: writes.at(-1) }); return true }
    if (url.pathname !== '/api/tools/analyze') return false
    await route.fulfill({ json: { token: 'test', kind: 'html', format: 'html', entry: 'index.html', files: ['index.html'], stats: { totalBytes: 10, zipBytes: 10 }, suggested: { id: 'demo', name: 'Demo' }, notes: [], compat: [], manifestDraft: { id: 'demo', name: 'Demo', version: '1.0.0', tags: [], category: 'development', permissions: {}, display: { mode: 'embedded', height: 'auto' } } } }); return true
  })
  await page.locator('.nav-item[data-view="tools"]').click(); await page.locator('#tools .kebab-toggle').first().click()
  await page.locator('.kebab-menu:not([hidden]) [data-edit-tool]').click()
  const tool = page.locator('.tool-edit-form'), originalTags = await tool.locator('[name="tags"]').inputValue()
  await page.locator('#tool-edit-save').focus(); await page.keyboard.press('Tab')
  await expect(tool.locator('[name="name"]')).toBeFocused()
  await page.keyboard.press('Shift+Tab'); await expect(page.locator('#tool-edit-save')).toBeFocused()
  const search = tool.locator('.picker-search'); await search.fill('工具标签'); await search.press('Enter')
  await expect(tool.locator('[name="tags"]')).toHaveValue([originalTags, '工具标签'].filter(Boolean).join(', '))
  await search.fill('x'.repeat(65)); await search.press('Enter'); await page.locator('#tool-edit-save').click()
  expect(writes).toHaveLength(0); await expect(search).toBeFocused()
  await search.fill(''); await page.locator('#tool-edit-save').click(); await expect(page.locator('#tool-edit')).toBeHidden()
  expect(writes).toHaveLength(1); expect(writes[0].tags).toEqual(['工具标签'])
  await page.locator('.nav-item[data-view="import"]').click()
  await page.locator('#tool-file-input').setInputFiles({ name: 'demo.html', mimeType: 'text/html', buffer: Buffer.from('<p>test</p>') })
  await page.locator('#wizard-next').click(); const metadata = page.locator('#wizard-body .wizard-form'); await selectTags(metadata, '向导标签')
  await metadata.locator('[name="name"]').fill('保留的向导名称')
  const wizardSearch = page.locator('#wizard-body .picker-search')
  await wizardSearch.fill('x'.repeat(65)); await wizardSearch.press('Enter'); await page.locator('#wizard-next').click()
  await expect(wizardSearch).toBeFocused(); await expect(page.locator('#wizard-steps [data-step="2"]')).toHaveClass(/active/)
  await wizardSearch.fill('')
  await page.locator('#wizard-prev').click(); await expect(page.locator('#wizard-steps [data-step="1"]')).toHaveClass(/active/)
  await page.locator('#wizard-next').click()
  await expect(page.locator('#wizard-body [name="name"]')).toHaveValue('保留的向导名称')
  await expect(page.locator('#wizard-body [name="tags"]')).toHaveValue('向导标签')
  await page.locator('#wizard-next').click()
  const notifications = page.locator('#wizard-body [name="perm.notifications"]'); await notifications.check()
  await page.locator('#wizard-prev').click(); await page.locator('#wizard-next').click()
  await expect(page.locator('#wizard-body [name="perm.notifications"]')).toBeChecked()
  await page.locator('#wizard-prev').click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('#wizard-body .picker-search')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('Admin 延迟笔记请求不会覆盖后来打开的编辑器', async ({ page }) => {
  let defer = false, finish
  await mockAdmin(page, async (route, url) => {
    if (!defer || url.pathname !== '/api/projects') return false
    await new Promise(resolve => { finish = async () => { await route.fulfill({ json: [] }); resolve() } }); return true
  })
  await page.locator('.nav-item[data-view="notes"]').click()
  defer = true
  await page.locator('[data-add-note]').click()
  await expect.poll(() => Boolean(finish)).toBe(true)
  await page.locator('.nav-item[data-view="library"]').click()
  await page.locator('[data-add-library]').click()
  await finish()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(page.locator('#library-form')).toBeVisible()
  await expect(page.locator('[data-view-panel="note-editor"]')).not.toHaveClass(/active/)
})

test('Admin 工具分析期间忽略重复上传，替换文件清理旧暂存并保留失败前内容', async ({ page }) => {
  let analyses = 0, finish; const removed = []
  await mockAdmin(page, async (route, url) => {
    if (url.pathname.startsWith('/api/tools/staging/')) { removed.push(url.pathname); await route.fulfill({ json: { ok: true } }); return true }
    if (url.pathname !== '/api/tools/analyze') return false
    const number = ++analyses
    if (number === 3) { await route.fulfill({ status: 400, json: { error: '新文件无法分析' } }); return true }
    const respond = () => route.fulfill({ json: { token: `token-${number}`, kind: 'html', format: 'html', entry: 'index.html', files: ['index.html'], stats: { totalBytes: 10, zipBytes: 10 }, suggested: { name: `文件 ${number}` }, notes: [], manifestDraft: { id: `file-${number}`, name: `文件 ${number}`, version: '1.0.0', tags: [], permissions: {}, display: { mode: 'embedded' } } } })
    if (number === 1) await new Promise(resolve => { finish = async () => { await respond(); resolve() } })
    else await respond()
    return true
  })
  await page.locator('.nav-item[data-view="import"]').click()
  const file = { name: 'one.html', mimeType: 'text/html', buffer: Buffer.from('<p>one</p>') }
  await page.locator('#tool-file-input').setInputFiles(file)
  await expect.poll(() => analyses).toBe(1)
  await page.locator('#wizard input[type="file"]').setInputFiles({ ...file, name: 'two.html' })
  await finish()
  await expect(page.locator('.wizard-summary')).toContainText('文件 1')
  expect(analyses).toBe(1)
  await page.locator('#wizard-close').focus(); await page.keyboard.press('Shift+Tab')
  await expect(page.locator('#wizard-next')).toBeFocused()
  await page.locator('#wizard input[type="file"]').setInputFiles({ ...file, name: 'two.html' })
  await expect(page.locator('.wizard-summary')).toContainText('文件 2')
  await expect.poll(() => removed).toContain('/api/tools/staging/token-1')
  await page.locator('#wizard input[type="file"]').setInputFiles({ ...file, name: 'bad.html' })
  await expect(page.locator('#wizard-status')).toContainText('新文件无法分析')
  await expect(page.locator('.wizard-summary')).toContainText('文件 2')
  await expect(page.locator('#wizard-next')).toBeEnabled()
  await page.locator('#wizard input[type="file"]').setInputFiles({ name: 'large.zip', mimeType: 'application/zip', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) })
  await expect(page.locator('#wizard-status')).toContainText('20 MiB')
  expect(analyses).toBe(3)
  await expect(page.locator('.wizard-summary')).toContainText('文件 2')
  await expect(page.locator('#wizard-next')).toBeEnabled()
})

test('Admin 项目编辑忽略旧请求，读取失败保留当前表单', async ({ page }) => {
  const pending = []; let defer = false, fail = false
  const { collections, errors } = await mockAdmin(page, async (route, url) => {
    if (url.pathname !== '/api/cfgs') return false
    if (fail) { await route.fulfill({ status: 500, json: { error: 'CFG 暂时不可用' } }); return true }
    if (!defer) return false
    await new Promise(resolve => pending.push(async () => { await route.fulfill({ json: [] }); resolve() })); return true
  })
  collections.projects.push(...['first', 'second'].map(id => ({ id, name: id, tags: [], cfgIds: [], order: 10, enabled: true, updated: '2026-09-08' })))
  await page.locator('.nav-item[data-view="projects"]').click()
  const edits = page.locator('[data-view-panel="projects"] .admin-collection-row button').filter({ hasText: /^编辑$/ })
  await expect(edits).toHaveCount(2); defer = true
  await edits.nth(0).click(); await edits.nth(1).click(); await expect.poll(() => pending.length).toBe(2)
  await pending[1](); const form = page.locator('#content-collection-form')
  await expect(form.locator('[name="id"]')).toHaveValue('second'); await form.locator('[name="name"]').fill('正在编辑第二个')
  await pending[0](); await expect(form.locator('[name="name"]')).toHaveValue('正在编辑第二个')
  fail = true; defer = false
  page.once('dialog', dialog => dialog.accept())
  await edits.nth(0).evaluate(node => node.click())
  await expect(page.locator('.toast').filter({ hasText: 'CFG 暂时不可用' })).toBeVisible()
  await expect(form.locator('[name="name"]')).toHaveValue('正在编辑第二个'); await expect(form).toBeVisible()
  expect(errors).toEqual([])
})
