import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

async function mockDesktopAdmin(page) {
  const collections = {}
  for (const key of ['navigation', 'categories', 'site', 'library', 'ai-resources', 'notes', 'projects', 'cfgs', 'ai-workflows']) collections[key] = JSON.parse(await readFile(resolve('src/data', `${key}.json`), 'utf8'))
  collections.projects = []; collections.notes = []; collections.cfgs = []
  const state = { collections, saves: [], failSave: false, errors: [] }
  page.on('pageerror', error => state.errors.push(error.message))
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname !== 'desktop-admin.mock') return route.abort()
    if (url.pathname.startsWith('/api/')) {
      const [key, id] = url.pathname.slice(5).split('/'), method = route.request().method()
      const reply = json => route.fulfill({ json })
      if (key === 'system') return reply({ version: 'test', admin: 'running' })
      if (key === 'validate') return reply({ ok: true, issues: [] })
      if (key === 'tools') return reply([])
      if (key === 'tags') return reply({ items: [] })
      if (!(key in collections)) return route.fulfill({ status: 404, json: { error: `unmocked ${key}` } })
      if (method === 'GET') return reply(collections[key])
      const data = route.request().postDataJSON(); state.saves.push(data)
      if (state.failSave) return route.fulfill({ status: 400, json: { error: '写入失败，原有文件保持不变' } })
      if (state.pendingSave) await state.pendingSave
      const { fileUpload, ...item } = data
      if (fileUpload) {
        const bytes = Buffer.from(fileUpload.data, 'base64')
        item.platform = 'windows-x64'; item.download = { filename: fileUpload.filename, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
      }
      if (method === 'POST') collections[key].push(item)
      else collections[key] = collections[key].map(original => original.id === id ? { ...original, ...item } : original)
      return reply(method === 'POST' ? item : collections[key])
    }
    const target = resolve(`.${url.pathname === '/admin/' ? '/admin/index.html' : url.pathname}`)
    try { return route.fulfill({ body: await readFile(target), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(target)] || 'application/octet-stream' }) } catch { return route.fulfill({ status: 404, body: 'not found' }) }
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('http://desktop-admin.mock/admin/')
  await expect(page.locator('#stat-websites')).not.toHaveText('—')
  if (await page.locator('#admin-menu').isVisible()) await page.locator('#admin-menu').click()
  await page.locator('.nav-item[data-view="projects"]').click()
  await page.getByRole('button', { name: '新增桌面工具', exact: true }).click()
  const form = page.locator('#content-collection-form')
  await form.locator('[name="id"]').fill('model-tool')
  await form.locator('[name="name"]').fill('社区服模型工具')
  return { state, form, input: form.getByLabel('选择或替换 EXE 文件', { exact: true }), save: form.getByRole('button', { name: '保存到项目', exact: true }) }
}

const fixture = name => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from('MZ\0desktop tool fixture') })

test('桌面工具 EXE 上传失败保留选择，重试保存；只改元信息保留文件', async ({ page }) => {
  const { state, form, input, save } = await mockDesktopAdmin(page)
  await form.locator('[name="version"]').fill('3.5')
  await input.setInputFiles(fixture('ModLink.exe'))
  await expect(form.getByRole('status').filter({ hasText: '待保存' })).toContainText('ModLink.exe')
  expect(state.saves).toHaveLength(0)
  await expect(form.locator('[name="platform"]')).toBeDisabled()
  state.failSave = true
  await save.click()
  await expect(form.getByRole('alert')).toHaveText('写入失败，原有文件保持不变')
  await expect(save).toBeEnabled()
  await expect(form.getByRole('status').filter({ hasText: '待保存' })).toContainText('ModLink.exe')
  state.failSave = false
  let finishSave
  state.pendingSave = new Promise(resolve => { finishSave = resolve })
  await save.click()
  await expect(save).toBeDisabled()
  await form.evaluate(node => node.requestSubmit())
  expect(state.saves).toHaveLength(2)
  finishSave(); state.pendingSave = null
  await expect(page.locator('#editor-drawer')).toBeHidden()
  expect(state.saves[1]).toMatchObject({ kind: 'desktop', version: '3.5', fileUpload: { filename: 'ModLink.exe', data: fixture('ModLink.exe').buffer.toString('base64') } })
  expect(state.saves[1]).not.toHaveProperty('download')
  const download = state.collections.projects[0].download
  await page.locator('.admin-collection-row').getByRole('button', { name: '编辑', exact: true }).click()
  await expect(form.getByRole('status').filter({ hasText: 'SHA-256' })).toContainText(download.sha256)
  await expect(form.locator('[name="platform"]')).toHaveValue('windows-x64')
  await expect(form.locator('[name="platform"]')).toBeDisabled()
  await form.locator('[name="description"]').fill('更新使用说明')
  await save.click()
  await expect(page.locator('#editor-drawer')).toBeHidden()
  expect(state.saves[2]).not.toHaveProperty('fileUpload')
  expect(state.saves[2]).not.toHaveProperty('download')
  expect(state.saves[2]).not.toHaveProperty('platform')
  expect(state.collections.projects[0].download).toEqual(download)
  expect(state.errors).toEqual([])
})

test('错误扩展名、大小或读取失败不丢失已选 EXE，旧读取结果不会覆盖新文件', async ({ page }) => {
  const { state, form, input, save } = await mockDesktopAdmin(page)
  await page.evaluate(() => {
    const Reader = window.FileReader
    window.FileReader = class extends Reader {
      readAsDataURL(file) {
        if (file.name === 'slow.exe') setTimeout(() => super.readAsDataURL(file), 300)
        else if (file.name === 'unreadable.exe') setTimeout(() => this.onerror(), 0)
        else super.readAsDataURL(file)
      }
    }
  })
  await input.setInputFiles(fixture('slow.exe'))
  await expect(save).toBeDisabled()
  await input.setInputFiles(fixture('latest.exe'))
  await expect(form.getByRole('status').filter({ hasText: '待保存' })).toContainText('latest.exe')
  await input.setInputFiles(fixture('wrong.txt'))
  await expect(form.getByRole('alert')).toContainText('请选择 .exe 文件')
  await input.setInputFiles({ name: 'large.exe', mimeType: 'application/octet-stream', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) })
  await expect(form.getByRole('alert')).toContainText('不能超过 20 MiB')
  await input.setInputFiles(fixture('unreadable.exe'))
  await expect(form.getByRole('alert')).toContainText('读取 EXE 文件失败')
  await expect(form.getByRole('status').filter({ hasText: '待保存' })).toContainText('latest.exe')
  await save.click()
  await expect(page.locator('#editor-drawer')).toBeHidden()
  expect(state.saves[0].fileUpload.filename).toBe('latest.exe')
  expect(state.errors).toEqual([])
})

test('手机上取消有上传文件时保护草稿，恢复只保存文件名并要求重新选择', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { state, form, input, save } = await mockDesktopAdmin(page)
  await input.setInputFiles(fixture('restore.exe'))
  await expect(form.getByRole('status').filter({ hasText: '待保存' })).toContainText('restore.exe')
  page.once('dialog', dialog => dialog.dismiss())
  await page.locator('#editor-drawer-close').click()
  await expect(form).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.locator('#editor-drawer-close').click()
  expect(state.saves).toHaveLength(0)
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('devos-admin-draft:projects:new')))
  expect(draft.extra).toEqual({ pendingFilename: 'restore.exe' })
  expect(JSON.stringify(draft)).not.toContain(fixture('restore.exe').buffer.toString('base64'))
  await page.getByRole('button', { name: '新增桌面工具', exact: true }).click()
  await form.getByRole('button', { name: '恢复草稿', exact: true }).click()
  await expect(form.getByRole('status').filter({ hasText: '需要重新选择' })).toContainText('restore.exe')
  await save.click()
  await expect(form.getByRole('alert')).toContainText('请重新选择草稿中的 EXE 文件')
  expect(state.saves).toHaveLength(0)
  await form.getByRole('button', { name: '取消文件替换', exact: true }).click()
  await expect(form.locator('[name="platform"]')).toBeEnabled()
  await expect(form.locator('[name="name"]')).toHaveValue('社区服模型工具')
  const box = await page.locator('.editor-modal').boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(391)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await save.click()
  await expect(page.locator('#editor-drawer')).toBeHidden()
  expect(state.saves[0]).not.toHaveProperty('fileUpload')
  expect(state.errors).toEqual([])
})
