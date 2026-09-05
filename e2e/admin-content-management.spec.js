import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { Buffer } from 'node:buffer'
import { gzipSync } from 'node:zlib'

async function mockAdmin(page, override) {
  const collections = {}
  for (const key of ['navigation', 'categories', 'site', 'library', 'ai-resources', 'notes', 'tags', 'projects', 'cfgs', 'ai-workflows']) collections[key] = JSON.parse(await readFile(resolve('src/data', `${key}.json`), 'utf8'))
  collections.projects = []; collections.notes = []; collections['ai-workflows'] = []; collections.cfgs = []
  const tools = JSON.parse(await readFile(resolve('public/tools-manifests.json'), 'utf8'))
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
      if (key === 'tools') return respond(tools)
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

test('Admin 项目、工作流与运维笔记表单联动，草稿与固定 ID 保持正确', async ({ page }) => {
  const { collections, errors } = await mockAdmin(page)
  await page.locator('.nav-item[data-view="projects"]').click()
  await page.getByRole('button', { name: '新增项目与服务' }).click()
  const form = page.locator('#content-collection-form')
  await form.locator('[name="id"]').fill('demo-project')
  await form.locator('[name="name"]').fill('联调项目')
  await form.locator('[name="body"]').fill('# 项目说明')
  page.once('dialog', dialog => dialog.dismiss())
  await page.locator('#editor-drawer-close').click()
  await expect(form).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.locator('#editor-drawer-close').click()
  await page.getByRole('button', { name: '新增项目与服务' }).click()
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
  await page.getByRole('button', { name: '新增项目与服务' }).click()
  await expect(page.locator('#content-collection-form [name="id"]')).toBeFocused()
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
  await page.evaluate(() => {
    const original = window.requestAnimationFrame, callbacks = []
    window.requestAnimationFrame = callback => { callbacks.push(callback); return callbacks.length }
    document.querySelector('[data-add-website]').click()
    const url = document.querySelector('#nav-form [name="url"]')
    url.focus(); url.value = 'https://example.com'; url.dispatchEvent(new Event('input', { bubbles: true }))
    window.requestAnimationFrame = original
    callbacks.forEach(callback => callback(window.performance.now()))
  })
  const form = page.locator('#nav-form')
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
