import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

const TOOL_ID = 'community-rainbow-chat-generator-v4-unicode-fix'
const NOTE_ID = 'e2e-summary-clip'

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
