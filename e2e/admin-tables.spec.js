import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

const TOOL_ID = 'community-rainbow-chat-generator-v4-unicode-fix'
const NOTE_ID = 'e2e-summary-clip'
const AI_RESOURCE_ID = 'e2e-ai-resource'

test('编辑弹窗阻止背景切页，关闭后可正常导航', async ({ page }) => {
  await page.goto('/admin/')
  await page.click('.nav-item[data-view="websites"]')
  const row = page.locator('#navigation tr').first()
  await row.locator('.kebab-toggle').click()
  await page.locator('.kebab-menu:not([hidden]) [data-edit]').click()
  await expect(page.locator('#editor-drawer')).toBeVisible()
  const categoryNav = await page.locator('.nav-item[data-view="categories"]').boundingBox()
  await page.mouse.click(categoryNav.x + 20, categoryNav.y + 20)
  await expect(page.locator('[data-view-panel="websites"]')).toBeVisible()
  await expect(page.locator('#editor-drawer')).toBeHidden()
  await page.click('.nav-item[data-view="categories"]')
  await expect(page.locator('[data-view-panel="categories"]')).toBeVisible()
})

test('编辑器管理分类和标签按钮可导航到对应面板', async ({ page }) => {
  await page.goto('/admin/')
  await page.click('.nav-item[data-view="websites"]')

  const websiteRow = page.locator('#navigation tr').first()
  await websiteRow.locator('.kebab-toggle').click()
  await page.locator('.kebab-menu:not([hidden]) [data-edit]').click()
  const websiteForm = page.locator('#nav-form')
  await websiteForm.locator('[data-view="categories"]').click()
  await expect(page.locator('#editor-drawer')).toBeHidden()
  await expect(page.locator('[data-view-panel="categories"]')).toBeVisible()

  await page.click('.nav-item[data-view="websites"]')
  await page.locator('#navigation tr').first().locator('.kebab-toggle').click()
  await page.locator('.kebab-menu:not([hidden]) [data-edit]').click()
  await page.locator('#nav-form [data-view="tags"]').click()
  await expect(page.locator('#editor-drawer')).toBeHidden()
  await expect(page.locator('[data-view-panel="tags"]')).toBeVisible()

  await page.click('.nav-item[data-view="ai-resources"]')
  const aiResourceRow = page.locator('#ai-resources tr').first()
  await aiResourceRow.locator('.kebab-toggle').click()
  await page.locator('.kebab-menu:not([hidden]) [data-edit-ai-resource]').click()
  await page.locator('#ai-resource-form [data-view="tags"]').click()
  await expect(page.locator('#editor-drawer')).toBeHidden()
  await expect(page.locator('[data-view-panel="tags"]')).toBeVisible()
})

test('Admin 管理 AI Hub 资源并校验数据', async ({ page, request, context }) => {
  await request.delete(`/api/ai-resources/${AI_RESOURCE_ID}`).catch(() => {})
  const valid = { id: AI_RESOURCE_ID, kind: 'app', name: 'E2E', description: '', content: '', url: 'https://example.com', tags: [], enabled: true, order: 1, updated: '2026-08-23' }
  for (const invalid of [
    { ...valid, kind: 'broken' },
    { ...valid, id: 'unsafe/id' },
    { ...valid, url: 'ftp://example.com' },
    { ...valid, content: '', url: '' },
    { ...valid, tags: 'broken' },
    { ...valid, enabled: 'yes' },
    { ...valid, updated: 'today' },
    { ...valid, updated: '2026-02-31' },
  ]) expect((await request.post('/api/ai-resources', { data: invalid })).status()).toBe(400)
  const infinite = await request.post('/api/ai-resources', {
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify(valid).replace('"order":1', '"order":1e309'),
  })
  expect(infinite.status()).toBe(400)
  try {
    await page.goto('/admin/')
    await page.click('.nav-item[data-view="ai-resources"]')
    await page.getByRole('button', { name: '添加资源' }).click()
    const form = page.locator('#ai-resource-form')
    await form.locator('[name="name"]').fill('E2E AI Product')
    await form.locator('[name="kind"]').selectOption('app')
    await form.locator('[name="description"]').fill('Admin managed resource')
    await form.locator('[name="url"]').fill('https://example.com/ai')
    await form.locator('[name="id"]').fill(AI_RESOURCE_ID)
    await form.locator('.tags-picker .picker-search').fill('product')
    await form.locator('.tags-picker .tag-option').first().click()
    await form.getByRole('button', { name: '保存资源' }).click()
    const row = page.locator('#ai-resources tr', { hasText: 'E2E AI Product' })
    await expect(row).toBeVisible()

    await row.locator('.kebab-toggle').click()
    await page.locator(`.kebab-menu:not([hidden]) [data-edit-ai-resource="${AI_RESOURCE_ID}"]`).click()
    await form.locator('[name="name"]').fill('E2E AI Product Updated')
    await form.getByRole('button', { name: '保存资源' }).click()
    await expect(page.locator('#ai-resources tr', { hasText: 'E2E AI Product Updated' })).toBeVisible()

    const updatedRow = page.locator('#ai-resources tr', { hasText: 'E2E AI Product Updated' })
    await updatedRow.locator('.kebab-toggle').click()
    await page.locator(`.kebab-menu:not([hidden]) [data-toggle-ai-resource="${AI_RESOURCE_ID}"]`).click()
    await expect(page.locator('.kebab-menu:not([hidden])')).toHaveCount(0)
    await expect(updatedRow).toContainText('禁用')
    await expect.poll(async () => (await (await request.get('/api/ai-resources')).json()).find(item => item.id === AI_RESOURCE_ID)?.enabled).toBe(false)
    const workspace = await context.newPage()
    await workspace.goto('http://127.0.0.1:5173/#/ai')
    await expect(workspace.getByRole('heading', { name: 'E2E AI Product Updated' })).toHaveCount(0)
    await workspace.close()

    await updatedRow.locator('.kebab-toggle').click()
    await page.locator(`.kebab-menu:not([hidden]) [data-delete-ai-resource="${AI_RESOURCE_ID}"]`).click()
    await expect(page.locator('.kebab-menu:not([hidden])')).toHaveCount(0)
    await page.locator('#modal-ok').click()
    await expect(page.locator('#ai-resources tr', { hasText: 'E2E AI Product Updated' })).toHaveCount(0)
  } finally {
    await request.delete(`/api/ai-resources/${AI_RESOURCE_ID}`).catch(() => {})
  }
})

test('Admin 分类标签图标控件可保存并重新打开', async ({ page, request }) => {
  const navigation = await (await request.get('/api/navigation')).json()
  const categories = await (await request.get('/api/categories')).json()
  const aiResources = await (await request.get('/api/ai-resources')).json()
  const originalWebsite = navigation[0]
  const originalCategory = categories[0]
  const originalAI = aiResources[0]
  const tag = `e2e-taxonomy-${Date.now()}`
  const pickerTag = `${tag}-seed`
  try {
    await request.post('/api/tags', { data: { name: pickerTag } })
    await page.goto('/admin/')

    await page.click('.nav-item[data-view="websites"]')
    let row = page.locator('#navigation tr').first()
    await row.locator('.kebab-toggle').click()
    await page.locator('.kebab-menu:not([hidden]) [data-edit]').click()
    const websiteForm = page.locator('#nav-form')
    await websiteForm.locator('[data-category-option]').first().click()
    await websiteForm.locator('.tags-picker .picker-search').fill(pickerTag)
    await websiteForm.locator(`[data-tag-option="${pickerTag}"]`).click()
    await websiteForm.locator('[data-icon-option="letter"]').click()
    await websiteForm.locator('button[type="submit"]').click()
    await expect.poll(async () => (await (await request.get('/api/navigation')).json()).find(item => item.id === originalWebsite.id)?.icon).toBe('letter')
    const savedWebsite = (await (await request.get('/api/navigation')).json()).find(item => item.id === originalWebsite.id)
    expect(savedWebsite.category).toBe(categories[0].id)
    expect(savedWebsite.tags).toContain(pickerTag)

    await page.click('.nav-item[data-view="ai-resources"]')
    row = page.locator('#ai-resources tr').first()
    await row.locator('.kebab-toggle').click()
    await page.locator('.kebab-menu:not([hidden]) [data-edit-ai-resource]').click()
    const aiForm = page.locator('#ai-resource-form')
    await aiForm.locator('.tags-picker .picker-search').fill(pickerTag)
    await aiForm.locator(`[data-tag-option="${pickerTag}"]`).click()
    await aiForm.locator('button[type="submit"]').click()
    await expect.poll(async () => (await (await request.get('/api/ai-resources')).json()).find(item => item.id === originalAI.id)?.tags || []).toContain(pickerTag)

    await page.click('.nav-item[data-view="categories"]')
    row = page.locator('#categories tr').first()
    await row.locator('.kebab-toggle').click()
    await page.locator('.kebab-menu:not([hidden]) [data-edit-category]').click()
    const categoryForm = page.locator('#category-form')
    await categoryForm.locator('[data-icon-option="Wrench"]').click()
    await categoryForm.locator('button[type="submit"]').click()
    await page.locator('#categories tr').first().locator('.kebab-toggle').click()
    await page.locator('.kebab-menu:not([hidden]) [data-edit-category]').click()
    await expect(page.locator('#category-form [data-icon-option="Wrench"]')).toHaveAttribute('aria-pressed', 'true')
    await page.click('#category-cancel')

    await page.click('.nav-item[data-view="tags"]')
    await page.locator('[data-add-tag]').click()
    await page.locator('#modal-body input').fill(tag)
    await page.locator('#modal-ok').click()
    await expect(page.locator('#tags')).toContainText(tag)
    await page.locator('#tag-query').fill(tag)
    await page.locator(`[data-view-tag="${tag}"]`).click()
    await page.locator('[data-rename-tag]').click()
    await page.locator('#modal-body input').fill(`${tag}-renamed`)
    await page.locator('#modal-ok').click()
    await expect(page.locator('#tags')).toContainText(`${tag}-renamed`)
    await page.locator('#tag-query').fill(`${tag}-renamed`)
    await page.locator(`[data-view-tag="${tag}-renamed"]`).click()
    await page.locator('[data-delete-tag]').click()
    await page.locator('#modal-ok').click()
    await expect(page.locator('#tags')).not.toContainText(`${tag}-renamed`)
  } finally {
    await request.put(`/api/navigation/${originalWebsite.id}`, { data: originalWebsite }).catch(() => {})
    await request.put(`/api/ai-resources/${originalAI.id}`, { data: originalAI }).catch(() => {})
    await request.put(`/api/categories/${originalCategory.id}`, { data: originalCategory }).catch(() => {})
    await request.delete(`/api/tags/${encodeURIComponent(tag)}`).catch(() => {})
    await request.delete(`/api/tags/${encodeURIComponent(`${tag}-renamed`)}`).catch(() => {})
    await request.delete(`/api/tags/${encodeURIComponent(pickerTag)}`).catch(() => {})
  }
})

test('工具管理可切换打开即全屏并写入 manifest', async ({ page, request }) => {
  const original = await (await request.get(`/tools/${TOOL_ID}/manifest.json`)).json()
  const height = original.display?.height ?? 'auto'
  try {
    await page.goto('/admin/')
    await page.click('.nav-item[data-view="tools"]')
    await expect(page.locator('#tools')).toContainText(TOOL_ID, { timeout: 10_000 })
    const toggle = page.locator('#tools tr', { hasText: TOOL_ID }).locator('.ui-switch')
    await expect(toggle).toBeVisible()
    if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 })
    await expect.poll(async () => {
      const manifest = await (await request.get(`/tools/${TOOL_ID}/manifest.json`)).json()
      return manifest.display.mode
    }, { timeout: 10_000 }).toBe('fullscreen')
    const saved = await (await request.get(`/tools/${TOOL_ID}/manifest.json`)).json()
    expect(saved.display.height).toEqual(height)
    await expect.poll(async () => {
      const list = await (await request.get('http://127.0.0.1:5173/tools-manifests.json')).json()
      return list.find(item => item.id === TOOL_ID)?.display?.mode
    }).toBe('fullscreen')

    await page.goto(`http://127.0.0.1:5173/#/tools/${TOOL_ID}`)
    const boot = page.getByTestId('boot-layer')
    if (await boot.count()) await expect(boot).toBeHidden({ timeout: 5_000 })
    const overlay = page.getByTestId('tool-fullscreen')
    await expect(overlay).toBeVisible({ timeout: 15_000 })
    const frameBox = await overlay.getByTestId('tool-frame').boundingBox()
    expect(frameBox?.height || 0).toBeGreaterThan(400)
  } finally {
    await request.put(`/api/tools/${TOOL_ID}`, {
      data: { display: { mode: original.display?.mode || 'embedded', height } },
    })
  }
})

test('笔记摘要过长时截断且不覆盖更新日期', async ({ page, request }) => {
  await request.delete(`/api/notes/${NOTE_ID}`).catch(() => {})
  const created = await request.post('/api/notes', {
    data: {
      id: NOTE_ID,
      title: 'E2E clip',
      summary: '收藏 GitHub 仓库 / Skill，以及用 Markdown 写很长很长很长很长很长很长很长很长的说明页摘要用于验证表格截断。'.repeat(3),
      tags: ['e2e'],
      enabled: true,
      order: 999,
      updated: '2026-08-22',
      body: 'e2e',
    },
  })
  expect(created.ok()).toBeTruthy()
  try {
    await page.goto('/admin/')
    await page.click('.nav-item[data-view="notes"]')
    const row = page.locator('#notes tr', { hasText: 'E2E clip' })
    await expect(row).toBeVisible()
    const summary = row.locator('td.cell-clip')
    const updated = row.locator('td').nth(2)
    const summaryBox = await summary.boundingBox()
    const updatedBox = await updated.boundingBox()
    expect(summaryBox, 'summary cell missing').toBeTruthy()
    expect(updatedBox, 'updated cell missing').toBeTruthy()
    expect(summaryBox.x + summaryBox.width).toBeLessThanOrEqual(updatedBox.x + 1)
    await expect(updated).toHaveText('2026-08-22')
  } finally {
    await request.delete(`/api/notes/${NOTE_ID}`)
  }
})

test('内置 React 工具可从列表删除', async ({ page, request }) => {
  const corePath = 'src/tools/manifests/core.json'
  const indexPath = 'public/tools-manifests.json'
  const coreBackup = readFileSync(corePath, 'utf8')
  const indexBackup = readFileSync(indexPath, 'utf8')
  const id = 'url'
  try {
    await page.goto('/admin/')
    await page.click('.nav-item[data-view="tools"]')
    const row = page.locator('#tools tr', { hasText: id })
    await expect(row).toBeVisible()
    await row.locator('.kebab-toggle').click()
    await page.locator(`.kebab-menu:not([hidden]) [data-delete-tool="${id}"]`).click()
    await page.locator('#modal-ok').click()
    await expect(page.locator('#tools tr', { hasText: id })).toHaveCount(0)
    await expect.poll(async () => {
      const list = await (await request.get('/api/tools')).json()
      return list.some(item => item.id === id)
    }).toBe(false)
  } finally {
    writeFileSync(corePath, coreBackup)
    writeFileSync(indexPath, indexBackup)
    await request.post('/api/tools/rebuild')
  }
})
