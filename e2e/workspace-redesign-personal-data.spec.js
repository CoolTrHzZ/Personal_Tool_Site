import { test, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'

test.use({ reducedMotion: 'reduce' })
async function openWorkspace(page) {
  await page.goto('/#/')
  await page.getByRole('button', { name: '我的工作区', exact: true }).click()
  await expect(page.getByRole('region', { name: '个人数据备份' })).toBeVisible()
}
async function readDownload(download) {
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

test('个人备份预览合并与替换会更新已挂载工作区，公开内容不混入备份', async ({ page }) => {
  await openWorkspace(page)
  await page.getByLabel('新增待办', { exact: true }).fill('导出的任务')
  await page.getByRole('button', { name: '添加待办', exact: true }).click()
  await page.getByLabel('临时便笺内容', { exact: true }).fill('第一台机器的便笺')
  await page.evaluate(() => localStorage.setItem('public-test-content', '不应导出'))
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出个人备份', exact: true }).click()
  const raw = await readDownload(await download)
  const backup = JSON.parse(raw)
  expect(backup.kind).toBe('devos-personal-data')
  expect(backup.entries['public-test-content']).toBeUndefined()
  await page.getByLabel('临时便笺内容', { exact: true }).fill('当前本机便笺')
  await page.getByLabel('新增待办', { exact: true }).fill('本机第二个任务')
  await page.getByRole('button', { name: '添加待办', exact: true }).click()
  await page.getByLabel('导入个人备份', { exact: true }).setInputFiles({ name: 'personal.json', mimeType: 'application/json', buffer: Buffer.from(raw) })
  await expect(page.locator('.personal-import-preview')).toContainText('2 项 → 2 项')
  await expect(page.getByLabel('临时便笺内容', { exact: true })).toHaveValue('当前本机便笺')
  await page.getByRole('button', { name: '确认导入个人数据', exact: true }).click()
  await expect(page.getByLabel('临时便笺内容', { exact: true })).toHaveValue('当前本机便笺\n\n--- 导入便笺 ---\n\n第一台机器的便笺')
  await expect(page.locator('.workspace-panel').getByRole('checkbox')).toHaveCount(2)
  await page.getByLabel('导入个人备份', { exact: true }).setInputFiles({ name: 'personal.json', mimeType: 'application/json', buffer: Buffer.from(raw) })
  await page.getByLabel('导入方式', { exact: true }).selectOption('replace')
  await page.getByRole('button', { name: '确认导入个人数据', exact: true }).click()
  await expect(page.getByLabel('临时便笺内容', { exact: true })).toHaveValue('第一台机器的便笺')
  await expect(page.locator('.workspace-panel').getByRole('checkbox')).toHaveCount(1)
  await page.reload()
  await expect(page.getByLabel('临时便笺内容', { exact: true })).toHaveValue('第一台机器的便笺')
})

test('便笺和收藏写失败后可备份，跨标签更新保留本页修改且可重试', async ({ page, context }) => {
  await openWorkspace(page)
  await page.evaluate(() => {
    const set = window.Storage.prototype.setItem
    window.restorePersonalWrites = () => { window.Storage.prototype.setItem = set }
    window.Storage.prototype.setItem = function (key, value) { if (['devos.workspace.note', 'favoriteTools'].includes(key)) throw new Error('quota'); return set.call(this, key, value) }
  })
  await page.getByLabel('临时便笺内容', { exact: true }).fill('本页未保存的便笺')
  const other = await context.newPage()
  await openWorkspace(other)
  await other.getByLabel('临时便笺内容', { exact: true }).fill('另一个标签页便笺')
  await expect(page.locator('#workspace-note-status')).toContainText('当前未保存修改已保留')
  await expect(page.getByLabel('临时便笺内容', { exact: true })).toHaveValue('本页未保存的便笺')
  const backupEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出个人备份', exact: true }).click()
  expect(JSON.parse(JSON.parse(await readDownload(await backupEvent)).entries['devos.workspace.note'])).toBe('本页未保存的便笺')
  await page.evaluate(() => window.restorePersonalWrites())
  await page.getByRole('button', { name: '重试保存便笺', exact: true }).click()
  await expect(other.getByLabel('临时便笺内容', { exact: true })).toHaveValue('本页未保存的便笺')
  await other.close()
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '工具', exact: true }).click()
  await page.evaluate(() => {
    const set = window.Storage.prototype.setItem
    window.restoreFavoriteWrites = () => { window.Storage.prototype.setItem = set }
    window.Storage.prototype.setItem = function (key, value) { if (key === 'favoriteTools') throw new Error('quota'); return set.call(this, key, value) }
  })
  const card = page.locator('.tool-card').first()
  await card.locator('.favorite-button').click()
  await expect(card.getByRole('alert')).toContainText('收藏未保存')
  const pressed = await card.locator('.favorite-button').getAttribute('aria-pressed')
  await page.evaluate(() => window.restoreFavoriteWrites())
  await card.getByRole('button', { name: '重试保存收藏', exact: true }).click()
  await expect(card.getByRole('alert')).toHaveCount(0)
  await expect(card.locator('.favorite-button')).toHaveAttribute('aria-pressed', pressed)
})


test('存储读取被拒绝时下载明确标记的恢复备份，重新导入不删除缺失项', async ({ page }) => {
  await openWorkspace(page)
  await page.evaluate(() => {
    localStorage.setItem('favoriteTools', '["json"]')
    const get = window.Storage.prototype.getItem, set = window.Storage.prototype.setItem
    window.restorePersonalStorage = () => { window.Storage.prototype.getItem = get; window.Storage.prototype.setItem = set }
    window.Storage.prototype.getItem = function () { throw new Error('storage denied') }
    window.Storage.prototype.setItem = function () { throw new Error('storage denied') }
  })
  await page.getByLabel('临时便笺内容', { exact: true }).fill('读取受阻时仍要保存的便笺')
  await expect(page.locator('#workspace-note-status')).toContainText('保存失败')
  const panel = page.getByRole('region', { name: '个人数据备份' })
  const downloadEvent = page.waitForEvent('download')
  await panel.getByRole('button', { name: '导出个人备份', exact: true }).click()
  const download = await downloadEvent, raw = await readDownload(download), backup = JSON.parse(raw)
  expect(download.suggestedFilename()).toBe('devos-personal-recovery.json')
  expect(backup.entries['devos.workspace.note']).toBe(JSON.stringify('读取受阻时仍要保存的便笺'))
  expect(backup.unavailableKeys).toContain('favoriteTools')
  await expect(panel.getByRole('alert')).toContainText('这不是完整备份')
  await expect(panel.getByRole('alert')).toContainText('工具收藏')
  await expect(panel.getByRole('status')).toContainText('恢复备份')

  await page.evaluate(() => window.restorePersonalStorage())
  const completeEvent = page.waitForEvent('download')
  await panel.getByRole('button', { name: '导出个人备份', exact: true }).click()
  const complete = await completeEvent
  expect(complete.suggestedFilename()).toBe('devos-personal-backup.json')
  expect(JSON.parse(await readDownload(complete)).unavailableKeys).toBeUndefined()
  await expect(panel.getByRole('alert')).toHaveCount(0)
  await panel.getByLabel('导入个人备份', { exact: true }).setInputFiles({ name: 'recovery.json', mimeType: 'application/json', buffer: Buffer.from(raw) })
  await expect(panel.getByRole('alert')).toContainText('这是部分恢复备份')
  await panel.getByLabel('导入方式', { exact: true }).selectOption('replace')
  await panel.getByRole('button', { name: '确认导入个人数据', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('favoriteTools'))).toBe('["json"]')
  await page.reload()
  await expect(page.getByLabel('临时便笺内容', { exact: true })).toHaveValue('读取受阻时仍要保存的便笺')
})

for (const metadata of ['unavailableKeys', 'unreadableKeys', 'none']) {
  test(`旧版单任务恢复保留两个现代任务并可重新导出：${metadata}`, async ({ page }) => {
    await openWorkspace(page)
    const modernKey = 'devos.ai-context.tasks.v1', legacyKey = 'devos.ai-context.draft.v1'
    const draft = project => ({ version: 1, project, goal: '', stack: '', background: '', constraints: '', acceptance: '', materials: [] })
    const current = { version: 1, activeId: 'modern-a', tasks: ['a', 'b'].map(id => ({ id: `modern-${id}`, name: `任务 ${id}`, updated: '2026-10-22T00:00:00.000Z', draft: draft(`现代 ${id}`) })) }
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: modernKey, value: current })
    const recovery = { kind: 'devos-personal-data', version: 1, exportedAt: '2026-10-22', entries: { [legacyKey]: JSON.stringify(draft('旧版恢复')) } }
    if (metadata !== 'none') recovery[metadata] = [modernKey]
    const panel = page.getByRole('region', { name: '个人数据备份' })
    await panel.getByLabel('导入个人备份', { exact: true }).setInputFiles({ name: 'legacy-recovery.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(recovery)) })
    await expect(panel).toContainText('旧版备份只包含一个 AI 草稿')
    if (metadata !== 'none') await expect(panel.getByRole('alert')).toContainText('这是部分恢复备份')
    await panel.getByLabel('导入方式', { exact: true }).selectOption('replace')
    await expect(panel.getByRole('button', { name: '确认导入个人数据', exact: true })).toHaveCount(0)
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), modernKey)).toEqual(current)
    await panel.getByLabel('导入方式', { exact: true }).selectOption('merge')
    await panel.getByRole('button', { name: '确认导入个人数据', exact: true }).click()
    const restored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), modernKey)
    expect(restored.activeId).toBe(current.activeId)
    expect(restored.tasks.map(task => task.draft.project)).toEqual(['现代 a', '现代 b', '旧版恢复'])
    const downloadEvent = page.waitForEvent('download')
    await panel.getByRole('button', { name: '导出个人备份', exact: true }).click()
    const download = await downloadEvent, exported = JSON.parse(await readDownload(download))
    expect(download.suggestedFilename()).toBe('devos-personal-backup.json')
    expect(JSON.parse(exported.entries[modernKey])).toEqual(restored)
    expect(exported.entries[legacyKey]).toBeUndefined()
    expect(exported.unavailableKeys).toBeUndefined()
    expect(exported.unreadableKeys).toBeUndefined()
    await page.reload()
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), modernKey)).toEqual(restored)
  })
}
